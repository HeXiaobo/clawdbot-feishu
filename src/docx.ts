import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createFeishuClient } from "./client.js";
import { resolveFeishuAccount, listEnabledFeishuAccounts } from "./accounts.js";
import type * as Lark from "@larksuiteoapi/node-sdk";
import { Readable } from "stream";
import { FeishuDocSchema, type FeishuDocParams } from "./doc-schema.js";
import { resolveToolsConfig } from "./tools-config.js";
import {
  BLOCK_TYPE_NAMES,
  LANGUAGE_MAP,
  type DocBlock,
} from "./docx-blocks.js";
import {
  convertMarkdownToBlocks,
  preprocessMarkdown,
} from "./markdown-converter.js";

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

/** Extract image URLs from markdown content */
function extractImageUrls(markdown: string): string[] {
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1].trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      urls.push(url);
    }
  }
  return urls;
}

// Block types that cannot be created via documentBlockChildren.create API
// Table (24) and TableCell (25) are not supported for creation via API
const UNSUPPORTED_CREATE_TYPES = new Set([24, 25]);

/**
 * Clean blocks for insertion (remove unsupported types and read-only fields)
 * Also handles conversion of table blocks to text representations
 */
function cleanBlocksForInsert(blocks: any[]): { cleaned: any[]; skipped: string[]; warnings: string[] } {
  const skipped: string[] = [];
  const warnings: string[] = [];
  const cleaned: any[] = [];

  for (const block of blocks) {
    if (UNSUPPORTED_CREATE_TYPES.has(block.block_type)) {
      const typeName = BLOCK_TYPE_NAMES[block.block_type] || `type_${block.block_type}`;
      skipped.push(typeName);
      warnings.push(`Skipped unsupported block type: ${typeName}`);
      continue;
    }

    // Clean up block structure
    let cleanedBlock = { ...block };

    // Remove read-only fields
    delete cleanedBlock.block_id;
    delete cleanedBlock.parent_id;
    delete cleanedBlock.children;
    delete cleanedBlock.document_id;

    // Handle table merge_info
    if (cleanedBlock.block_type === 24 && cleanedBlock.table?.merge_info) {
      const { merge_info, ...tableRest } = cleanedBlock.table;
      cleanedBlock = { ...cleanedBlock, table: tableRest };
    }

    cleaned.push(cleanedBlock);
  }

  return { cleaned, skipped, warnings };
}

// ============ Markdown Conversion ============

/**
 * Convert markdown using Feishu API
 * This is the original method using the document.convert API
 */
async function convertMarkdownViaApi(
  client: Lark.Client,
  markdown: string,
): Promise<{ blocks: any[]; firstLevelBlockIds: string[]; warnings?: string[] }> {
  const res = await client.docx.document.convert({
    data: { content_type: "markdown", content: markdown },
  });

  if (res.code !== 0) {
    throw new Error(`API convert failed: ${res.msg}`);
  }

  const warnings: string[] = [];
  const blocks = res.data?.blocks ?? [];

  // Post-process blocks to fix issues
  const processedBlocks = blocks.map((block: any) => {
    // Fix code block language
    if (block.block_type === 14 && block.code) {
      // Ensure code block has proper structure
      if (!block.code.elements || block.code.elements.length === 0) {
        block.code.elements = [{ text_run: { content: "" } }];
      }
    }
    return block;
  });

  return {
    blocks: processedBlocks,
    firstLevelBlockIds: res.data?.first_level_block_ids ?? [],
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Convert markdown using local parser
 * This provides better control over the output format
 */
function convertMarkdownLocal(markdown: string): { blocks: DocBlock[]; warnings?: string[] } {
  const preprocessed = preprocessMarkdown(markdown);
  const blocks = convertMarkdownToBlocks(preprocessed);
  
  return { blocks };
}

/**
 * Hybrid converter: tries API first, falls back to local if needed
 */
async function convertMarkdown(
  client: Lark.Client,
  markdown: string,
  options?: { preferLocal?: boolean; fallbackToLocal?: boolean },
): Promise<{ blocks: any[]; firstLevelBlockIds?: string[]; warnings?: string[]; method: "api" | "local" }> {
  const warnings: string[] = [];

  // Use local converter if preferred
  if (options?.preferLocal) {
    const localResult = convertMarkdownLocal(markdown);
    return {
      blocks: localResult.blocks,
      warnings: localResult.warnings,
      method: "local",
    };
  }

  // Try API first
  try {
    const apiResult = await convertMarkdownViaApi(client, markdown);
    return {
      blocks: apiResult.blocks,
      firstLevelBlockIds: apiResult.firstLevelBlockIds,
      warnings: apiResult.warnings,
      method: "api",
    };
  } catch (error) {
    if (options?.fallbackToLocal !== false) {
      warnings.push(`API conversion failed: ${error instanceof Error ? error.message : String(error)}. Falling back to local converter.`);
      const localResult = convertMarkdownLocal(markdown);
      return {
        blocks: localResult.blocks,
        warnings: [...warnings, ...(localResult.warnings || [])],
        method: "local",
      };
    }
    throw error;
  }
}

// ============ Block Operations ============

async function insertBlocks(
  client: Lark.Client,
  docToken: string,
  blocks: any[],
  parentBlockId?: string,
): Promise<{ children: any[]; skipped: string[]; warnings: string[] }> {
  const { cleaned, skipped, warnings: cleanWarnings } = cleanBlocksForInsert(blocks);
  const blockId = parentBlockId ?? docToken;

  if (cleaned.length === 0) {
    return { children: [], skipped, warnings: cleanWarnings };
  }

  const res = await client.docx.documentBlockChildren.create({
    path: { document_id: docToken, block_id: blockId },
    data: { children: cleaned },
  });

  if (res.code !== 0) {
    throw new Error(`Failed to insert blocks: ${res.msg}`);
  }

  return {
    children: res.data?.children ?? [],
    skipped,
    warnings: cleanWarnings,
  };
}

async function clearDocumentContent(client: Lark.Client, docToken: string) {
  const existing = await client.docx.documentBlock.list({
    path: { document_id: docToken },
  });
  if (existing.code !== 0) throw new Error(existing.msg);

  const childIds =
    existing.data?.items
      ?.filter((b) => b.parent_id === docToken && b.block_type !== 1)
      .map((b) => b.block_id) ?? [];

  if (childIds.length > 0) {
    const res = await client.docx.documentBlockChildren.batchDelete({
      path: { document_id: docToken, block_id: docToken },
      data: { start_index: 0, end_index: childIds.length },
    });
    if (res.code !== 0) throw new Error(res.msg);
  }

  return childIds.length;
}

// ============ Image Handling ============

async function uploadImageToDocx(
  client: Lark.Client,
  blockId: string,
  imageBuffer: Buffer,
  fileName: string,
): Promise<string> {
  const res = await client.drive.media.uploadAll({
    data: {
      file_name: fileName,
      parent_type: "docx_image",
      parent_node: blockId,
      size: imageBuffer.length,
      file: Readable.from(imageBuffer) as any,
    },
  });

  const fileToken = res?.file_token;
  if (!fileToken) {
    throw new Error("Image upload failed: no file_token returned");
  }
  return fileToken;
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function processImages(
  client: Lark.Client,
  docToken: string,
  markdown: string,
  insertedBlocks: any[],
): Promise<number> {
  const imageUrls = extractImageUrls(markdown);
  if (imageUrls.length === 0) return 0;

  const imageBlocks = insertedBlocks.filter((b) => b.block_type === 23 || b.block_type === 27);

  let processed = 0;
  for (let i = 0; i < Math.min(imageUrls.length, imageBlocks.length); i++) {
    const url = imageUrls[i];
    const blockId = imageBlocks[i].block_id;

    try {
      const buffer = await downloadImage(url);
      const urlPath = new URL(url).pathname;
      const fileName = urlPath.split("/").pop() || `image_${i}.png`;
      const fileToken = await uploadImageToDocx(client, blockId, buffer, fileName);

      await client.docx.documentBlock.patch({
        path: { document_id: docToken, block_id: blockId },
        data: {
          replace_image: { token: fileToken },
        },
      });

      processed++;
    } catch (err) {
      console.error(`Failed to process image ${url}:`, err);
    }
  }

  return processed;
}

// ============ Actions ============

const STRUCTURED_BLOCK_TYPES = new Set([14, 17, 18, 19, 20, 21, 23, 27, 30, 31]);

async function readDoc(client: Lark.Client, docToken: string) {
  const [contentRes, infoRes, blocksRes] = await Promise.all([
    client.docx.document.rawContent({ path: { document_id: docToken } }),
    client.docx.document.get({ path: { document_id: docToken } }),
    client.docx.documentBlock.list({ path: { document_id: docToken } }),
  ]);

  if (contentRes.code !== 0) throw new Error(contentRes.msg);

  const blocks = blocksRes.data?.items ?? [];
  const blockCounts: Record<string, number> = {};
  const structuredTypes: string[] = [];

  for (const b of blocks) {
    const type = b.block_type ?? 0;
    const name = BLOCK_TYPE_NAMES[type] || `type_${type}`;
    blockCounts[name] = (blockCounts[name] || 0) + 1;

    if (STRUCTURED_BLOCK_TYPES.has(type) && !structuredTypes.includes(name)) {
      structuredTypes.push(name);
    }
  }

  let hint: string | undefined;
  if (structuredTypes.length > 0) {
    hint = `This document contains ${structuredTypes.join(", ")} which are NOT included in the plain text above. Use feishu_doc with action: "list_blocks" to get full content.`;
  }

  return {
    title: infoRes.data?.document?.title,
    content: contentRes.data?.content,
    revision_id: infoRes.data?.document?.revision_id,
    block_count: blocks.length,
    block_types: blockCounts,
    ...(hint && { hint }),
  };
}

async function createDoc(client: Lark.Client, title: string, folderToken?: string) {
  const res = await client.docx.document.create({
    data: { title, folder_token: folderToken },
  });
  if (res.code !== 0) throw new Error(res.msg);
  const doc = res.data?.document;
  return {
    document_id: doc?.document_id,
    title: doc?.title,
    url: `https://feishu.cn/docx/${doc?.document_id}`,
  };
}

async function writeDoc(
  client: Lark.Client,
  docToken: string,
  markdown: string,
  options?: { preferLocalConverter?: boolean },
) {
  const deleted = await clearDocumentContent(client, docToken);

  const { blocks, warnings, method } = await convertMarkdown(client, markdown, {
    preferLocal: options?.preferLocalConverter,
    fallbackToLocal: true,
  });

  if (blocks.length === 0) {
    return {
      success: true,
      blocks_deleted: deleted,
      blocks_added: 0,
      images_processed: 0,
      conversion_method: method,
    };
  }

  const { children: inserted, skipped, warnings: insertWarnings } = await insertBlocks(
    client,
    docToken,
    blocks,
  );
  
  const imagesProcessed = await processImages(client, docToken, markdown, inserted);

  const allWarnings = [...(warnings || []), ...insertWarnings];
  const result: Record<string, any> = {
    success: true,
    blocks_deleted: deleted,
    blocks_added: inserted.length,
    images_processed: imagesProcessed,
    conversion_method: method,
  };

  if (skipped.length > 0) {
    result.warning = `Skipped unsupported block types: ${skipped.join(", ")}. Tables are not supported via this API.`;
  }
  if (allWarnings.length > 0) {
    result.warnings = allWarnings;
  }

  return result;
}

async function appendDoc(
  client: Lark.Client,
  docToken: string,
  markdown: string,
  options?: { preferLocalConverter?: boolean },
) {
  const { blocks, warnings, method } = await convertMarkdown(client, markdown, {
    preferLocal: options?.preferLocalConverter,
    fallbackToLocal: true,
  });

  if (blocks.length === 0) {
    throw new Error("Content is empty");
  }

  const { children: inserted, skipped, warnings: insertWarnings } = await insertBlocks(
    client,
    docToken,
    blocks,
  );
  
  const imagesProcessed = await processImages(client, docToken, markdown, inserted);

  const allWarnings = [...(warnings || []), ...insertWarnings];
  const result: Record<string, any> = {
    success: true,
    blocks_added: inserted.length,
    images_processed: imagesProcessed,
    block_ids: inserted.map((b: any) => b.block_id),
    conversion_method: method,
  };

  if (skipped.length > 0) {
    result.warning = `Skipped unsupported block types: ${skipped.join(", ")}. Tables are not supported via this API.`;
  }
  if (allWarnings.length > 0) {
    result.warnings = allWarnings;
  }

  return result;
}

async function updateBlock(
  client: Lark.Client,
  docToken: string,
  blockId: string,
  content: string,
) {
  const blockInfo = await client.docx.documentBlock.get({
    path: { document_id: docToken, block_id: blockId },
  });
  if (blockInfo.code !== 0) throw new Error(blockInfo.msg);

  const res = await client.docx.documentBlock.patch({
    path: { document_id: docToken, block_id: blockId },
    data: {
      update_text_elements: {
        elements: [{ text_run: { content } }],
      },
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return { success: true, block_id: blockId };
}

async function deleteBlock(client: Lark.Client, docToken: string, blockId: string) {
  const blockInfo = await client.docx.documentBlock.get({
    path: { document_id: docToken, block_id: blockId },
  });
  if (blockInfo.code !== 0) throw new Error(blockInfo.msg);

  const parentId = blockInfo.data?.block?.parent_id ?? docToken;

  const children = await client.docx.documentBlockChildren.get({
    path: { document_id: docToken, block_id: parentId },
  });
  if (children.code !== 0) throw new Error(children.msg);

  const items = children.data?.items ?? [];
  const index = items.findIndex((item: any) => item.block_id === blockId);
  if (index === -1) throw new Error("Block not found");

  const res = await client.docx.documentBlockChildren.batchDelete({
    path: { document_id: docToken, block_id: parentId },
    data: { start_index: index, end_index: index + 1 },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return { success: true, deleted_block_id: blockId };
}

async function listBlocks(client: Lark.Client, docToken: string) {
  const res = await client.docx.documentBlock.list({
    path: { document_id: docToken },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    blocks: res.data?.items ?? [],
  };
}

async function getBlock(client: Lark.Client, docToken: string, blockId: string) {
  const res = await client.docx.documentBlock.get({
    path: { document_id: docToken, block_id: blockId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    block: res.data?.block,
  };
}

async function listAppScopes(client: Lark.Client) {
  const res = await client.application.scope.list({});
  if (res.code !== 0) throw new Error(res.msg);

  const scopes = res.data?.scopes ?? [];
  const granted = scopes.filter((s) => s.grant_status === 1);
  const pending = scopes.filter((s) => s.grant_status !== 1);

  return {
    granted: granted.map((s) => ({ name: s.scope_name, type: s.scope_type })),
    pending: pending.map((s) => ({ name: s.scope_name, type: s.scope_type })),
    summary: `${granted.length} granted, ${pending.length} pending`,
  };
}

async function deleteDocument(client: Lark.Client, docToken: string) {
  const res = await client.drive.file.delete({
    path: { file_token: docToken },
    params: { type: "docx" },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    success: true,
    document_id: docToken,
    task_id: res.data?.task_id,
  };
}

// ============ Tool Registration ============

export function registerFeishuDocTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_doc: No config available, skipping doc tools");
    return;
  }

  const accounts = listEnabledFeishuAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("feishu_doc: No Feishu accounts configured, skipping doc tools");
    return;
  }

  const firstAccount = accounts[0];
  const toolsCfg = resolveToolsConfig(firstAccount.config.tools);

  const getClient = () => createFeishuClient(firstAccount);
  const registered: string[] = [];

  if (toolsCfg.doc) {
    api.registerTool(
      {
        name: "feishu_doc",
        label: "Feishu Doc",
        description:
          "Feishu document operations. Actions: read, write, append, create, delete, list_blocks, get_block, update_block, delete_block. Enhanced markdown conversion with proper formatting for headings, lists, code blocks, tables (ASCII), quotes, dividers, and links.",
        parameters: FeishuDocSchema,
        async execute(_toolCallId, params) {
          const p = params as FeishuDocParams;
          try {
            const client = getClient();
            switch (p.action) {
              case "read":
                return json(await readDoc(client, p.doc_token));
              case "write":
                return json(await writeDoc(client, p.doc_token, p.content));
              case "append":
                return json(await appendDoc(client, p.doc_token, p.content));
              case "create":
                return json(await createDoc(client, p.title, p.folder_token));
              case "list_blocks":
                return json(await listBlocks(client, p.doc_token));
              case "get_block":
                return json(await getBlock(client, p.doc_token, p.block_id));
              case "update_block":
                return json(await updateBlock(client, p.doc_token, p.block_id, p.content));
              case "delete_block":
                return json(await deleteBlock(client, p.doc_token, p.block_id));
              case "delete":
                return json(await deleteDocument(client, p.doc_token));
              default:
                return json({ error: `Unknown action: ${(p as any).action}` });
            }
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { name: "feishu_doc" },
    );
    registered.push("feishu_doc");
  }

  if (toolsCfg.scopes) {
    api.registerTool(
      {
        name: "feishu_app_scopes",
        label: "Feishu App Scopes",
        description:
          "List current app permissions (scopes). Use to debug permission issues or check available capabilities.",
        parameters: Type.Object({}),
        async execute() {
          try {
            const result = await listAppScopes(getClient());
            return json(result);
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { name: "feishu_app_scopes" },
    );
    registered.push("feishu_app_scopes");
  }

  if (registered.length > 0) {
    api.logger.info?.(`feishu_doc: Registered ${registered.join(", ")}`);
  }
}

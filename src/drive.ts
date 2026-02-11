import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createFeishuClient } from "./client.js";
import { listEnabledFeishuAccounts } from "./accounts.js";
import type * as Lark from "@larksuiteoapi/node-sdk";
import { FeishuDriveSchema, type FeishuDriveParams } from "./drive-schema.js";
import { resolveToolsConfig } from "./tools-config.js";

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// ============ Actions ============

async function getRootFolderToken(client: Lark.Client): Promise<string> {
  // Use generic HTTP client to call the root folder meta API
  // as it's not directly exposed in the SDK
  const domain = (client as any).domain ?? "https://open.feishu.cn";
  const res = (await (client as any).httpInstance.get(
    `${domain}/open-apis/drive/explorer/v2/root_folder/meta`,
  )) as { code: number; msg?: string; data?: { token?: string } };
  if (res.code !== 0) throw new Error(res.msg ?? "Failed to get root folder");
  const token = res.data?.token;
  if (!token) throw new Error("Root folder token not found");
  return token;
}

async function listFolder(client: Lark.Client, folderToken?: string) {
  // Filter out invalid folder_token values (empty, "0", etc.)
  const validFolderToken = folderToken && folderToken !== "0" ? folderToken : undefined;
  const res = await client.drive.file.list({
    params: validFolderToken ? { folder_token: validFolderToken } : {},
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    files:
      res.data?.files?.map((f) => ({
        token: f.token,
        name: f.name,
        type: f.type,
        url: f.url,
        created_time: f.created_time,
        modified_time: f.modified_time,
        owner_id: f.owner_id,
      })) ?? [],
    next_page_token: res.data?.next_page_token,
  };
}

async function getFileInfo(client: Lark.Client, fileToken: string, folderToken?: string) {
  // Use list with folder_token to find file info
  const res = await client.drive.file.list({
    params: folderToken ? { folder_token: folderToken } : {},
  });
  if (res.code !== 0) throw new Error(res.msg);

  const file = res.data?.files?.find((f) => f.token === fileToken);
  if (!file) {
    throw new Error(`File not found: ${fileToken}`);
  }

  return {
    token: file.token,
    name: file.name,
    type: file.type,
    url: file.url,
    created_time: file.created_time,
    modified_time: file.modified_time,
    owner_id: file.owner_id,
  };
}

async function createFolder(client: Lark.Client, name: string, folderToken?: string) {
  // Feishu supports using folder_token="0" as the root folder.
  // We *try* to resolve the real root token (explorer API), but fall back to "0"
  // because some tenants/apps return 400 for that explorer endpoint.
  let effectiveToken = folderToken && folderToken !== "0" ? folderToken : "0";
  if (effectiveToken === "0") {
    try {
      effectiveToken = await getRootFolderToken(client);
    } catch {
      // ignore and keep "0"
    }
  }

  const res = await client.drive.file.createFolder({
    data: {
      name,
      folder_token: effectiveToken,
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    token: res.data?.token,
    url: res.data?.url,
  };
}

async function moveFile(
  client: Lark.Client,
  fileToken: string,
  type: string,
  folderToken: string,
) {
  const res = await client.drive.file.move({
    path: { file_token: fileToken },
    data: {
      type: type as "doc" | "docx" | "sheet" | "bitable" | "folder" | "file" | "mindnote" | "slides",
      folder_token: folderToken,
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    success: true,
    task_id: res.data?.task_id,
  };
}

async function deleteFile(client: Lark.Client, fileToken: string, type: string) {
  const res = await client.drive.file.delete({
    path: { file_token: fileToken },
    params: {
      type: type as
        | "doc"
        | "docx"
        | "sheet"
        | "bitable"
        | "folder"
        | "file"
        | "mindnote"
        | "slides"
        | "shortcut",
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    success: true,
    task_id: res.data?.task_id,
  };
}

async function downloadFile(client: Lark.Client, fileToken: string, fileName?: string) {
  // Get file info first to determine the file name and type
  const fileInfoRes = await client.drive.file.get({
    path: { file_token: fileToken },
  });
  
  if (fileInfoRes.code !== 0) {
    throw new Error(`Failed to get file info: ${fileInfoRes.msg}`);
  }
  
  const fileInfo = fileInfoRes.data?.file;
  if (!fileInfo) {
    throw new Error("File not found");
  }
  
  // Only support sheet type
  if (fileInfo.type !== "sheet") {
    throw new Error(`This download only supports Sheet (电子表格) files. Current type: ${fileInfo.type}. Please use feishu_bitable for Bitable files.`);
  }
  
  const actualFileName = fileName || fileInfo.name || `sheet_${fileToken}`;
  
  // For Sheet (电子表格), use the spreadsheet export API
  const domain = (client as any).domain ?? "https://open.feishu.cn";
  
  // Create export task for sheet
  const exportRes = await (client as any).httpInstance.post(
    `${domain}/open-apis/sheets/v2/spreadsheets/${fileToken}/export`,
    {
      export_format: "xlsx",  // Export as Excel format
    }
  );
  
  if (exportRes.code !== 0) {
    throw new Error(`Failed to create sheet export task: ${exportRes.msg}`);
  }
  
  const taskId = exportRes.data?.ticket;
  if (!taskId) {
    throw new Error("No export task ID returned from sheet export");
  }
  
  // Poll for export completion
  let retries = 20;
  while (retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const resultRes = await (client as any).httpInstance.get(
      `${domain}/open-apis/drive/v1/export_tasks/${taskId}`
    );
    
    if (resultRes.code === 0 && resultRes.data?.result?.file_token) {
      // Export complete, download the file
      const downloadRes = await (client as any).httpInstance.get(
        `${domain}/open-apis/drive/v1/files/${resultRes.data.result.file_token}/download`,
        { responseType: 'arraybuffer' }
      );
      
      // Save to temp file
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const tempDir = os.tmpdir();
      const safeFileName = actualFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const finalFileName = safeFileName.endsWith('.xlsx') ? safeFileName : `${safeFileName}.xlsx`;
      const tempPath = path.join(tempDir, `feishu_sheet_${fileToken}_${finalFileName}`);
      
      fs.writeFileSync(tempPath, Buffer.from(downloadRes.data));
      
      return {
        file_token: fileToken,
        file_name: actualFileName,
        file_type: "sheet",
        local_path: tempPath,
        size: Buffer.from(downloadRes.data).length,
        export_format: "xlsx",
      };
    }
    
    // Check if export failed
    if (resultRes.data?.status === "failed") {
      throw new Error(`Sheet export failed: ${resultRes.data?.error || 'Unknown error'}`);
    }
    
    retries--;
  }
  
  throw new Error("Sheet export task timeout (30s)");
}

// ============ Tool Registration ============

export function registerFeishuDriveTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_drive: No config available, skipping drive tools");
    return;
  }

  const accounts = listEnabledFeishuAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("feishu_drive: No Feishu accounts configured, skipping drive tools");
    return;
  }

  const firstAccount = accounts[0];
  const toolsCfg = resolveToolsConfig(firstAccount.config.tools);
  if (!toolsCfg.drive) {
    api.logger.debug?.("feishu_drive: drive tool disabled in config");
    return;
  }

  const getClient = () => createFeishuClient(firstAccount);

  api.registerTool(
    {
      name: "feishu_drive",
      label: "Feishu Drive",
      description:
        "Feishu cloud storage operations. Actions: list, info, create_folder, move, delete, download (Sheet only)",
      parameters: FeishuDriveSchema,
      async execute(_toolCallId, params) {
        const p = params as FeishuDriveParams;
        try {
          const client = getClient();
          switch (p.action) {
            case "list":
              return json(await listFolder(client, p.folder_token));
            case "info":
              return json(await getFileInfo(client, p.file_token));
            case "create_folder":
              return json(await createFolder(client, p.name, p.folder_token));
            case "move":
              return json(await moveFile(client, p.file_token, p.type, p.folder_token));
            case "delete":
              return json(await deleteFile(client, p.file_token, p.type));
            case "download":
              return json(await downloadFile(client, p.file_token, p.file_name));
            default:
              return json({ error: `Unknown action: ${(p as any).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "feishu_drive" },
  );

  api.logger.info?.(`feishu_drive: Registered feishu_drive tool`);
}

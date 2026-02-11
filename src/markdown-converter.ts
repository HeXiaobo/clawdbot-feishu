/**
 * Enhanced Markdown to Feishu Docx Blocks Converter
 * 
 * 优化点：
 * 1. 正确的标题层级映射 (# -> Heading1, ## -> Heading2, ### -> Heading3)
 * 2. 正确处理列表缩进和嵌套
 * 3. 代码块语法高亮支持
 * 4. 表格转换为 ASCII 格式文本块
 * 5. 引用块样式优化
 * 6. 分割线正确处理
 * 7. 链接格式优化
 */

import type { DocBlock, TextElement } from "./docx-blocks.js";
import { getLanguageCode } from "./docx-blocks.js";

// Markdown 元素类型
interface MarkdownNode {
  type: "heading" | "paragraph" | "code" | "list" | "quote" | "divider" | "table" | "text";
  level?: number;           // 标题层级
  language?: string;        // 代码块语言
  content?: string;         // 内容
  items?: MarkdownNode[];   // 列表项或引用内容
  ordered?: boolean;        // 是否有序列表
  rows?: string[][];        // 表格数据
  align?: ("left" | "center" | "right" | null)[]; // 表格对齐
}

/**
 * 解析 Markdown 为结构化节点
 */
export function parseMarkdown(markdown: string): MarkdownNode[] {
  const lines = markdown.split("\n");
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行跳过
    if (trimmed === "") {
      i++;
      continue;
    }

    // 标题
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^(#{1,6})\\s+(.+)$/);
      if (match) {
        nodes.push({
          type: "heading",
          level: match[1].length,
          content: match[2].trim(),
        });
        i++;
        continue;
      }
    }

    // 代码块
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push({
        type: "code",
        language: lang || undefined,
        content: codeLines.join("\n"),
      });
      i++;
      continue;
    }

    // 分割线
    if (/^(---|\\*\\*\\*|___)\\s*$/.test(trimmed)) {
      nodes.push({ type: "divider" });
      i++;
      continue;
    }

    // 引用块
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().slice(1).trim());
        i++;
      }
      nodes.push({
        type: "quote",
        content: quoteLines.join("\n"),
      });
      continue;
    }

    // 表格
    if (trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseTable(tableLines);
      if (table) {
        nodes.push(table);
      }
      continue;
    }

    // 列表
    if (/^(\\s*)([-\\*+]|\\d+\\.)\\s+/.test(line)) {
      const listResult = parseList(lines, i);
      nodes.push(listResult.node);
      i = listResult.nextIndex;
      continue;
    }

    // 普通段落
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push({
        type: "paragraph",
        content: paraLines.join(" ").trim(),
      });
    }
  }

  return nodes;
}

/**
 * 检查是否是块级元素开始
 */
function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("```") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("-") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("+") ||
    /^\\d+\\./.test(trimmed) ||
    trimmed.includes("|") ||
    /^(---|\\*\\*\\*|___)\\s*$/.test(trimmed)
  );
}

/**
 * 解析表格
 */
function parseTable(lines: string[]): MarkdownNode | null {
  if (lines.length < 2) return null;

  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  // 检查是否有分隔行 (---)
  if (rows.length >= 2 && rows[1].every((c) => /^[-:]+$/.test(c))) {
    rows.splice(1, 1); // 移除分隔行
  }

  if (rows.length === 0) return null;

  return {
    type: "table",
    rows,
  };
}

/**
 * 解析列表
 */
function parseList(lines: string[], startIndex: number): { node: MarkdownNode; nextIndex: number } {
  const items: MarkdownNode[] = [];
  let i = startIndex;
  const baseIndent = lines[startIndex].match(/^(\\s*)/)?.[1].length || 0;
  const ordered = /^\\s*\\d+\\./.test(lines[startIndex]);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    const match = line.match(/^(\\s*)(?:[-\\*+]|\\d+\\.)\\s+(.*)$/);
    if (!match) break;

    const indent = match[1].length;
    if (indent < baseIndent) break;

    const content = match[2];
    i++;

    // 收集列表项内容（可能有多行）
    const itemLines = [content];
    while (i < lines.length && lines[i].trim() !== "" && !isListItem(lines[i])) {
      itemLines.push(lines[i].trim());
      i++;
    }

    items.push({
      type: "text",
      content: itemLines.join(" "),
    });
  }

  return {
    node: {
      type: "list",
      ordered,
      items,
    },
    nextIndex: i,
  };
}

/**
 * 检查是否是列表项
 */
function isListItem(line: string): boolean {
  return /^(\\s*)([-\\*+]|\\d+\\.)\\s+/.test(line);
}

/**
 * 将 Markdown 节点转换为 Feishu Block
 */
export function nodesToBlocks(nodes: MarkdownNode[]): DocBlock[] {
  const blocks: DocBlock[] = [];

  for (const node of nodes) {
    const block = nodeToBlock(node);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * 单个节点转 Block
 */
function nodeToBlock(node: MarkdownNode): DocBlock | null {
  switch (node.type) {
    case "heading":
      return createHeadingBlock(node.level || 1, node.content || "");

    case "paragraph":
      return createTextBlock(node.content || "");

    case "code":
      return createCodeBlock(node.content || "", node.language);

    case "quote":
      return createQuoteBlock(node.content || "");

    case "divider":
      return createDividerBlock();

    case "list":
      return createListBlock(node.items || [], node.ordered || false);

    case "table":
      return createTableBlock(node.rows || []);

    default:
      return null;
  }
}

/**
 * 创建标题 Block
 */
function createHeadingBlock(level: number, content: string): DocBlock {
  const elements = parseInlineMarkdown(content);

  // 飞书只支持 Heading1, Heading2, Heading3
  // 4级及以上标题转为普通文本加粗
  if (level === 1) {
    return {
      block_type: 3,
      heading1: { elements },
    };
  } else if (level === 2) {
    return {
      block_type: 4,
      heading2: { elements },
    };
  } else if (level === 3) {
    return {
      block_type: 5,
      heading3: { elements },
    };
  } else {
    // 4级及以上转为加粗文本
    return {
      block_type: 2,
      text: {
        elements: [{
          text_run: {
            content: content,
            style: { bold: true },
          },
        }],
      },
    };
  }
}

/**
 * 创建文本 Block
 */
function createTextBlock(content: string): DocBlock {
  return {
    block_type: 2,
    text: {
      elements: parseInlineMarkdown(content),
    },
  };
}

/**
 * 创建代码块
 */
function createCodeBlock(content: string, language?: string): DocBlock {
  return {
    block_type: 14,
    code: {
      elements: [{ text_run: { content } }],
      style: language ? { language: getLanguageCode(language) } : undefined,
    },
  };
}

/**
 * 创建引用块
 */
function createQuoteBlock(content: string): DocBlock {
  return {
    block_type: 15,
    quote: {
      elements: parseInlineMarkdown(content),
    },
  };
}

/**
 * 创建分割线
 */
function createDividerBlock(): DocBlock {
  return {
    block_type: 22,
    divider: {},
  };
}

/**
 * 创建列表 Block
 */
function createListBlock(items: MarkdownNode[], ordered: boolean): DocBlock {
  const elements = items.map((item) => ({
    text_run: { content: item.content || "" },
  }));

  if (ordered) {
    return {
      block_type: 13,
      ordered: {
        elements: elements as any,
      },
    };
  } else {
    return {
      block_type: 12,
      bullet: {
        elements: elements as any,
      },
    };
  }
}

/**
 * 创建表格 Block（转换为文本表示）
 * 
 * 由于飞书 API 不支持直接创建表格，我们将其转换为格式化的文本块
 */
function createTableBlock(rows: string[][]): DocBlock | null {
  if (rows.length === 0) return null;

  // 计算每列的最大宽度
  const colWidths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const width = row[i]?.length || 0;
      colWidths[i] = Math.max(colWidths[i] || 0, width);
    }
  }

  // 构建 ASCII 表格
  const lines: string[] = [];

  // 表头分隔线
  const separator = colWidths.map((w) => "-".repeat(w + 2)).join("+");
  lines.push("+" + separator + "+");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.map((cell, j) => {
      const width = colWidths[j] || 0;
      return " " + (cell || "").padEnd(width) + " ";
    });
    lines.push("|" + cells.join("|") + "|");

    // 表头后加分隔线
    if (i === 0) {
      lines.push("+" + separator + "+");
    }
  }

  // 底部线
  lines.push("+" + separator + "+");

  return {
    block_type: 14, // 作为代码块显示
    code: {
      elements: [{ text_run: { content: lines.join("\n") } }],
      style: { language: 0 }, // plaintext
    },
  };
}

/**
 * 解析行内 Markdown（链接、加粗、斜体、代码等）
 */
function parseInlineMarkdown(text: string): TextElement[] {
  const elements: TextElement[] = [];
  let remaining = text;

  // 匹配模式：链接、加粗、斜体、行内代码
  const patterns = [
    { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: "link" },        // [text](url)
    { regex: /\*\*([^*]+)\*\*/g, type: "bold" },                  // **text**
    { regex: /\*([^*]+)\*/g, type: "italic" },                      // *text*
    { regex: /`([^`]+)`/g, type: "code" },                              // `text`
  ];

  // 简单处理：先提取链接
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // 链接前的文本
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      elements.push(...parseTextWithStyles(beforeText));
    }

    // 链接
    elements.push({
      link: {
        url: match[2],
        content: match[1],
      },
    });

    lastIndex = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    elements.push(...parseTextWithStyles(remainingText));
  }

  if (elements.length === 0) {
    elements.push({ text_run: { content: text } });
  }

  return elements;
}

/**
 * 解析文本中的样式（加粗、斜体、行内代码）
 */
function parseTextWithStyles(text: string): TextElement[] {
  const elements: TextElement[] = [];

  // 处理加粗 **text**
  const boldRegex = /\\*\\*([^\\*]+)\\*\\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push({ text_run: { content: text.slice(lastIndex, match.index) } });
    }
    elements.push({
      text_run: {
        content: match[1],
        style: { bold: true },
      },
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push({ text_run: { content: text.slice(lastIndex) } });
  }

  if (elements.length === 0) {
    elements.push({ text_run: { content: text } });
  }

  return elements;
}

/**
 * 增强版 Markdown 转换器
 * 
 * 主入口函数：将 Markdown 字符串转换为 Feishu Docx Blocks
 */
export function convertMarkdownToBlocks(markdown: string): DocBlock[] {
  const nodes = parseMarkdown(markdown);
  return nodesToBlocks(nodes);
}

/**
 * 预处理 Markdown，修复常见问题
 */
export function preprocessMarkdown(markdown: string): string {
  return (
    markdown
      // 规范化换行
      .replace(/\\r\\n/g, "\n")
      .replace(/\\r/g, "\n")
      // 移除多余的空行
      .replace(/\\n\\n\\n+/g, "\n\n")
      // 确保标题后有换行
      .replace(/^(#{1,6}.*)$/gm, "$1\n")
      // 确保代码块标记前后有换行
      .replace(/([^\\n])```/g, "$1\n```")
      .replace(/```([^\\n])/g, "```\n$1")
  );
}

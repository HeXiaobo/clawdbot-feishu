/**
 * Feishu Docx Block Types Reference
 * 
 * Block Type IDs:
 * 1: Page - 页面根节点
 * 2: Text - 普通文本
 * 3: Heading1 - 一级标题
 * 4: Heading2 - 二级标题
 * 5: Heading3 - 三级标题
 * 6: Heading4 - 四级标题 (不支持创建)
 * 7: Heading5 - 五级标题 (不支持创建)
 * 8: Heading6 - 六级标题 (不支持创建)
 * 9: Heading7 - 七级标题 (不支持创建)
 * 10: Heading8 - 八级标题 (不支持创建)
 * 11: Heading9 - 九级标题 (不支持创建)
 * 12: Bullet - 无序列表
 * 13: Ordered - 有序列表
 * 14: Code - 代码块
 * 15: Quote - 引用块
 * 16: Todo - 待办事项
 * 17: Bitable - 多维表格
 * 18: Callout - 高亮块
 * 19: Chat Card - 消息卡片
 * 20: Diagram - 流程图
 * 21: File - 文件
 * 22: Divider - 分割线
 * 23: Image - 图片
 * 24: Table - 表格 (不支持通过 documentBlockChildren.create 创建)
 * 25: TableCell - 表格单元格 (不支持创建)
 * 26: Iframe - 内嵌框架
 * 27: Sheet - 电子表格
 * 28: undefined
 * 29: undefined
 * 30: undefined
 * 31: View - 视图
 * 32: undefined
 */

// 支持创建的 Block 类型
export const SUPPORTED_BLOCK_TYPES = new Set([
  2,   // Text
  3,   // Heading1
  4,   // Heading2
  5,   // Heading3
  12,  // Bullet
  13,  // Ordered
  14,  // Code
  15,  // Quote
  16,  // Todo
  22,  // Divider
  23,  // Image
]);

// Block 类型名称映射
export const BLOCK_TYPE_NAMES: Record<number, string> = {
  1: "Page",
  2: "Text",
  3: "Heading1",
  4: "Heading2",
  5: "Heading3",
  6: "Heading4",
  7: "Heading5",
  8: "Heading6",
  9: "Heading7",
  10: "Heading8",
  11: "Heading9",
  12: "Bullet",
  13: "Ordered",
  14: "Code",
  15: "Quote",
  16: "Todo",
  17: "Callout",
  18: "ChatCard",
  19: "Diagram",
  20: "File",
  22: "Divider",
  23: "Image",
  24: "Table",
  25: "TableCell",
  26: "Iframe",
  27: "Sheet",
  31: "View",
};

// 文本元素接口
export interface TextElement {
  text_run?: {
    content: string;
    style?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      code?: boolean;
    };
  };
  link?: {
    url: string;
    content?: string;
  };
}

// Block 接口
export interface DocBlock {
  block_type: number;
  text?: {
    elements: TextElement[];
    style?: {
      align?: number;  // 1: left, 2: center, 3: right
    };
  };
  heading1?: {
    elements: TextElement[];
  };
  heading2?: {
    elements: TextElement[];
  };
  heading3?: {
    elements: TextElement[];
  };
  bullet?: {
    elements: TextElement[];
  };
  ordered?: {
    elements: TextElement[];
  };
  code?: {
    elements: TextElement[];
    style?: {
      language?: number;  // 语言代码
    };
  };
  quote?: {
    elements: TextElement[];
  };
  divider?: Record<string, never>;
  image?: {
    token: string;
  };
}

// 语言映射表 (飞书 API 使用数字代码)
export const LANGUAGE_MAP: Record<string, number> = {
  "plaintext": 0,
  "text": 0,
  "abap": 1,
  "ada": 2,
  "apache": 3,
  "apex": 4,
  "applescript": 5,
  "aql": 6,
  "arduino": 7,
  "armasm": 8,
  "asciidoc": 9,
  "aspnet": 10,
  "autohotkey": 11,
  "autoit": 12,
  "bash": 13,
  "shell": 13,
  "sh": 13,
  "basic": 14,
  "batch": 15,
  "bat": 15,
  "cmd": 15,
  "bison": 16,
  "bnf": 17,
  "brainfuck": 18,
  "c": 19,
  "cs": 20,
  "csharp": 20,
  "cpp": 21,
  "c++": 21,
  "cmake": 22,
  "coffeescript": 23,
  "coffee": 23,
  "cos": 24,
  "css": 25,
  "d": 26,
  "dart": 27,
  "diff": 28,
  "django": 29,
  "dns": 30,
  "docker": 31,
  "dockerfile": 31,
  "dos": 32,
  "elixir": 33,
  "elm": 34,
  "erb": 35,
  "erlang": 36,
  "fortran": 37,
  "fsharp": 38,
  "fs": 38,
  "gherkin": 39,
  "go": 40,
  "golang": 40,
  "gradle": 41,
  "graphql": 42,
  "groovy": 43,
  "haml": 44,
  "handlebars": 45,
  "hbs": 45,
  "haskell": 46,
  "haxe": 47,
  "html": 48,
  "http": 49,
  "ini": 50,
  "toml": 50,
  "java": 51,
  "javascript": 52,
  "js": 52,
  "json": 53,
  "julia": 54,
  "kotlin": 55,
  "kt": 55,
  "latex": 56,
  "less": 57,
  "lisp": 58,
  "livescript": 59,
  "lua": 60,
  "makefile": 61,
  "markdown": 62,
  "md": 62,
  "matlab": 63,
  "nginx": 64,
  "nim": 65,
  "nix": 66,
  "objectivec": 67,
  "objc": 67,
  "ocaml": 68,
  "pascal": 69,
  "perl": 70,
  "php": 71,
  "powershell": 72,
  "ps": 72,
  "ps1": 72,
  "prolog": 73,
  "protobuf": 74,
  "puppet": 75,
  "python": 76,
  "py": 76,
  "r": 77,
  "ruby": 78,
  "rb": 78,
  "rust": 79,
  "sass": 80,
  "scala": 81,
  "scheme": 82,
  "scss": 83,
  "smalltalk": 84,
  "sql": 85,
  "stylus": 86,
  "swift": 87,
  "tcl": 88,
  "tex": 89,
  "typescript": 90,
  "ts": 90,
  "vbnet": 91,
  "vb": 91,
  "verilog": 92,
  "vhdl": 93,
  "vim": 94,
  "xml": 95,
  "yaml": 96,
  "yml": 96,
};

// 获取语言代码
export function getLanguageCode(lang: string | undefined): number {
  if (!lang) return 0;
  return LANGUAGE_MAP[lang.toLowerCase()] ?? 0;
}

import { Type } from "@sinclair/typebox";

// ============ Action Schemas ============

const UseUserTokenField = Type.Optional(
  Type.Boolean({
    description: "是否使用用户身份令牌读取（用于外部组织文档，默认 false）",
    default: false,
  })
);

export const SheetsActionSchema = Type.Object({
  action: Type.Literal("sheets"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
  useUserToken: UseUserTokenField,
});

export const ReadActionSchema = Type.Object({
  action: Type.Literal("read"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
  range: Type.String({
    description: '要读取的范围，格式为 "sheetId!A1:Z100"',
  }),
  useUserToken: UseUserTokenField,
});

export const ReadAllActionSchema = Type.Object({
  action: Type.Literal("read_all"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
  sheet_id: Type.Optional(
    Type.String({
      description: "工作表 ID，不指定则使用第一个工作表",
    })
  ),
  useUserToken: UseUserTokenField,
});

export const WriteRangeActionSchema = Type.Object({
  action: Type.Literal("write_range"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
  range: Type.String({
    description: '要写入的范围，格式为 "sheetId!A1:Z100"',
  }),
  values: Type.Array(Type.Array(Type.Any()), {
    description: "二维数组写入内容，例如 [[\"A1\",\"B1\"],[\"A2\",\"B2\"]]",
    minItems: 1,
  }),
  valueInputOption: Type.Optional(
    Type.Union([Type.Literal("RAW"), Type.Literal("USER_ENTERED")], {
      description: "写入模式：RAW 原样写入；USER_ENTERED 按用户输入解析（默认）",
      default: "USER_ENTERED",
    })
  ),
  useUserToken: UseUserTokenField,
});

// ============ Main Schema ============

export const FeishuSheetSchema = Type.Union([
  SheetsActionSchema,
  ReadActionSchema,
  ReadAllActionSchema,
  WriteRangeActionSchema,
]);

export type FeishuSheetParams =
  | { action: "sheets"; spreadsheet_token: string; useUserToken?: boolean }
  | { action: "read"; spreadsheet_token: string; range: string; useUserToken?: boolean }
  | { action: "read_all"; spreadsheet_token: string; sheet_id?: string; useUserToken?: boolean }
  | {
      action: "write_range";
      spreadsheet_token: string;
      range: string;
      values: unknown[][];
      valueInputOption?: "RAW" | "USER_ENTERED";
      useUserToken?: boolean;
    };

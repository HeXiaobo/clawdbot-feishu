import { Type } from "@sinclair/typebox";

// ============ Action Schemas ============

export const SheetsActionSchema = Type.Object({
  action: Type.Literal("sheets"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
});

export const ReadActionSchema = Type.Object({
  action: Type.Literal("read"),
  spreadsheet_token: Type.String({
    description: "电子表格 token（从 URL /sheets/XXX 提取）",
  }),
  range: Type.String({
    description: '要读取的范围，格式为 "sheetId!A1:Z100"',
  }),
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
});

// ============ Main Schema ============

export const FeishuSheetSchema = Type.Union([
  SheetsActionSchema,
  ReadActionSchema,
  ReadAllActionSchema,
]);

export type FeishuSheetParams =
  | { action: "sheets"; spreadsheet_token: string }
  | { action: "read"; spreadsheet_token: string; range: string }
  | { action: "read_all"; spreadsheet_token: string; sheet_id?: string };

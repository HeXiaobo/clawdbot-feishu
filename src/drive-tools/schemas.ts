import { Type, type Static } from "@sinclair/typebox";

const FileType = Type.Union([
  Type.Literal("doc"),
  Type.Literal("docx"),
  Type.Literal("sheet"),
  Type.Literal("bitable"),
  Type.Literal("folder"),
  Type.Literal("file"),
  Type.Literal("mindnote"),
  Type.Literal("shortcut"),
]);

const DocType = Type.Union([
  Type.Literal("docx", { description: "New generation document (default)" }),
  Type.Literal("doc", { description: "Legacy document" }),
]);

export const FeishuDriveSchema = Type.Union([
  Type.Object({
    action: Type.Literal("list"),
    folder_token: Type.Optional(
      Type.String({ description: "Folder token (optional, omit for root directory)" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("info"),
    file_token: Type.String({ description: "File or folder token" }),
    type: FileType,
  }),
  Type.Object({
    action: Type.Literal("create_folder"),
    name: Type.String({ description: "Folder name" }),
    folder_token: Type.Optional(
      Type.String({ description: "Parent folder token (optional, omit for root)" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("move"),
    file_token: Type.String({ description: "File token to move" }),
    type: FileType,
    folder_token: Type.String({ description: "Target folder token" }),
  }),
  Type.Object({
    action: Type.Literal("delete"),
    file_token: Type.String({ description: "File token to delete" }),
    type: FileType,
  }),

  Type.Object({
    action: Type.Literal("download"),
    file_token: Type.String({
      description: "File token to download (supports Drive file/download and media/download with fallback)",
    }),
    save_to: Type.Optional(Type.String({ description: "Optional absolute/relative output path" })),
    prefer_media: Type.Optional(
      Type.Boolean({ description: "Prefer drive.media.download first (for doc attachments/images)" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("upload"),
    folder_token: Type.String({ description: "Target folder token" }),
    path: Type.Optional(Type.String({ description: "Local file path to upload" })),
    file_path: Type.Optional(Type.String({ description: "Alias of path" })),
    name: Type.Optional(Type.String({ description: "Optional file name override" })),
  }),
  Type.Object({
    action: Type.Literal("import_document"),
    title: Type.String({
      description: "Document title",
    }),
    content: Type.String({
      description:
        "Markdown content to import. Supports full Markdown syntax including tables, lists, code blocks, etc.",
    }),
    folder_token: Type.Optional(
      Type.String({
        description: "Target folder token (optional, defaults to root). Use 'list' to find folder tokens.",
      }),
    ),
    doc_type: Type.Optional(DocType),
  }),
]);

export type FeishuDriveParams = Static<typeof FeishuDriveSchema>;
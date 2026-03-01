import { Type } from "@sinclair/typebox";

export const FeishuSecretsSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("add"),
      Type.Literal("update"),
      Type.Literal("delete"),
    ],
    {
      description: "Action to perform: list, add, update, delete",
    },
  ),
  key: Type.Optional(
    Type.String({
      description: "Secret key name (required for add/update/delete)",
    }),
  ),
  value: Type.Optional(
    Type.String({
      description: "Secret value (required for add/update)",
    }),
  ),
  description: Type.Optional(
    Type.String({
      description: "Optional description for the secret",
    }),
  ),
});

export type FeishuSecretsParams = {
  action: "list" | "add" | "update" | "delete";
  key?: string;
  value?: string;
  description?: string;
};

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { FeishuSecretsSchema, type FeishuSecretsParams } from "./schemas.js";
import { runSecretsAction } from "./actions.js";

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message });
}

export function registerFeishuSecretsTools(api: OpenClawPluginApi) {
  api.registerTool(
    {
      name: "feishu_secrets",
      label: "Feishu Secrets",
      description:
        "Manage Feishu plugin secrets. Actions: list (show keys only), add (create new secret), update (modify existing), delete (remove secret). Secrets are stored in ~/.openclaw/extensions/feishu/.secrets.json with 600 permissions. Use SecretRef format: {\"source\": \"feishu\", \"id\": \"KEY_NAME\"}",
      parameters: FeishuSecretsSchema,
      async execute(_toolCallId, params) {
        try {
          const result = await runSecretsAction(params as FeishuSecretsParams);
          return json(result);
        } catch (err) {
          return errorResult(err);
        }
      },
    },
    { name: "feishu_secrets" },
  );

  api.logger.debug?.("feishu_secrets: Registered feishu_secrets tool");
}

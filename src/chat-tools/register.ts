import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { hasFeishuToolEnabledForAnyAccount, withFeishuToolClient } from "../tools-common/tool-exec.js";
import { getChatHistory } from "./actions.js";
import { ChatHistorySchema, type ChatHistoryParams } from "./schemas.js";

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

export function registerFeishuChatTools(api: OpenClawPluginApi) {
  if (!api.config || !hasFeishuToolEnabledForAnyAccount(api.config)) {
    api.logger.debug?.("feishu_chat: Feishu credentials not configured, skipping chat tools");
    return;
  }

  api.registerTool(
    {
      name: "feishu_chat_history",
      label: "Feishu Chat History",
      description:
        "Get chat history from a Feishu group chat. Returns message list with sender info, timestamps, and content. Supports time range filtering and pagination.",
      parameters: ChatHistorySchema,
      async execute(_toolCallId, params) {
        try {
          return await withFeishuToolClient({
            api,
            toolName: "feishu_chat_history",
            run: async ({ client }) => {
              const { chat_id, start_time, end_time, page_size, page_token } = params as ChatHistoryParams;
              const result = await getChatHistory(
                client,
                chat_id,
                start_time,
                end_time,
                page_size,
                page_token
              );
              return json(result);
            },
          });
        } catch (err) {
          return errorResult(err);
        }
      },
    },
    { name: "feishu_chat_history" },
  );

  api.logger.debug?.("feishu_chat: Registered feishu_chat_history tool");
}

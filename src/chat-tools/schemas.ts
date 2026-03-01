import { Type } from "@sinclair/typebox";

export type ChatHistoryParams = {
  chat_id: string;
  start_time?: string;
  end_time?: string;
  page_size?: number;
  page_token?: string;
};

export const ChatHistorySchema = Type.Object({
  chat_id: Type.String({
    description: "Chat ID (群聊 ID)",
  }),
  start_time: Type.Optional(
    Type.String({
      description: "Start time (Unix timestamp in milliseconds, e.g., '1609459200000')",
    })
  ),
  end_time: Type.Optional(
    Type.String({
      description: "End time (Unix timestamp in milliseconds, e.g., '1609545600000')",
    })
  ),
  page_size: Type.Optional(
    Type.Number({
      description: "Number of messages per page (1-100, default 50)",
      minimum: 1,
      maximum: 100,
    })
  ),
  page_token: Type.Optional(
    Type.String({
      description: "Pagination token from previous response",
    })
  ),
});

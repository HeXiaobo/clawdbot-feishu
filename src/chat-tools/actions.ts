import type * as Lark from "@larksuiteoapi/node-sdk";

export interface ChatHistoryResult {
  messages: Array<{
    message_id: string;
    sender: {
      id: string;
      id_type: string;
      sender_type: string;
      tenant_key?: string;
    };
    create_time: string;
    update_time: string;
    chat_id: string;
    msg_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: string;
      id_type: string;
      name: string;
      tenant_key?: string;
    }>;
  }>;
  has_more: boolean;
  page_token?: string;
}

export async function getChatHistory(
  client: Lark.Client,
  chat_id: string,
  start_time?: string,
  end_time?: string,
  page_size?: number,
  page_token?: string
): Promise<ChatHistoryResult> {
  const params: {
    container_id_type: string;
    container_id: string;
    start_time?: string;
    end_time?: string;
    page_size?: number;
    page_token?: string;
  } = {
    container_id_type: "chat",
    container_id: chat_id,
  };

  if (start_time) params.start_time = start_time;
  if (end_time) params.end_time = end_time;
  if (page_size) params.page_size = page_size;
  if (page_token) params.page_token = page_token;

  const response = await client.im.message.list({ params });

  if (response.code !== 0) {
    throw new Error(
      `Failed to get chat history: ${response.code} - ${response.msg}`
    );
  }

  const data = response.data || {};
  const items = data.items || [];

  const messages = items.map((item: any) => ({
    message_id: item.message_id || "",
    sender: {
      id: item.sender?.id || "",
      id_type: item.sender?.id_type || "",
      sender_type: item.sender?.sender_type || "",
      tenant_key: item.sender?.tenant_key,
    },
    create_time: item.create_time || "",
    update_time: item.update_time || "",
    chat_id: item.chat_id || "",
    msg_type: item.msg_type || "",
    content: item.body?.content || "",
    mentions: item.mentions?.map((m: any) => ({
      key: m.key || "",
      id: m.id?.open_id || m.id?.user_id || "",
      id_type: m.id?.id_type || "",
      name: m.name || "",
      tenant_key: m.tenant_key,
    })),
  }));

  return {
    messages,
    has_more: data.has_more || false,
    page_token: data.page_token,
  };
}

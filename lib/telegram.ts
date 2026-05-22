import "server-only";

import {
  ADMIN_TELEGRAM_CHAT_ID,
  TELEGRAM_BOT_TOKEN,
} from "@/lib/server-config";

export type TelegramInlineButton = {
  text: string;
  callback_data: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineButton[][];
};

export type TelegramMessageResult = {
  message_id: number;
  chat: {
    id: number;
    title?: string;
    type?: string;
  };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      title?: string;
      type?: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        title?: string;
        type?: string;
      };
      text?: string;
    };
    data?: string;
  };
};

function buildEndpoint(method: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    return null;
  }

  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

async function callTelegramApi<T>(method: string, body: Record<string, unknown>) {
  const endpoint = buildEndpoint(method);

  if (!endpoint) {
    return { ok: false as const, skipped: true as const, result: null as T | null };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${text}`);
  }

  const payload = (await response.json()) as { ok: boolean; result: T };

  if (!payload.ok) {
    throw new Error(`Telegram API ${method} returned an unsuccessful response.`);
  }

  return { ok: true as const, skipped: false as const, result: payload.result };
}

export async function sendTelegramMessage(input: {
  text: string;
  chatId: string | number;
  replyMarkup?: TelegramReplyMarkup;
}) {
  return callTelegramApi<TelegramMessageResult>("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function sendTelegramUserMessage(
  chatId: string | number,
  text: string,
  options?: {
    replyMarkup?: TelegramReplyMarkup;
  },
) {
  return sendTelegramMessage({
    chatId,
    text,
    replyMarkup: options?.replyMarkup,
  });
}

export async function editTelegramMessage(input: {
  chatId: string | number;
  messageId: string | number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}) {
  return callTelegramApi<TelegramMessageResult>("editMessageText", {
    chat_id: input.chatId,
    message_id: Number(input.messageId),
    text: input.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  return callTelegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: input.showAlert ?? false,
  });
}

export async function getTelegramUpdates(input?: {
  offset?: number;
  timeoutSeconds?: number;
}) {
  return callTelegramApi<TelegramUpdate[]>("getUpdates", {
    offset: input?.offset,
    timeout: input?.timeoutSeconds ?? 10,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function sendTelegramAdminMessage(
  message: string,
  options?: {
    replyMarkup?: TelegramReplyMarkup;
  },
) {
  if (!ADMIN_TELEGRAM_CHAT_ID) {
    return {
      ok: false as const,
      skipped: true as const,
      result: null as TelegramMessageResult | null,
    };
  }

  return sendTelegramMessage({
    chatId: ADMIN_TELEGRAM_CHAT_ID,
    text: message,
    replyMarkup: options?.replyMarkup,
  });
}

export async function sendTelegramNotification(
  message: string,
  options?: {
    replyMarkup?: TelegramReplyMarkup;
  },
) {
  return sendTelegramAdminMessage(message, options);
}

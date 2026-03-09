/**
 * Minimal response shape shared by Feishu OpenAPI endpoints.
 * Most endpoints return success when `code` is `0` (or omitted).
 */
export type FeishuApiResponse = {
  code?: number;
  msg?: string;
  log_id?: string;
  logId?: string;
};

type FeishuErrorInfo = {
  code?: number;
  msg?: string;
  logId?: string;
};

type FeishuTaggedError = Error & {
  code?: number;
  msg?: string;
  log_id?: string;
  logId?: string;
  feishu_error?: {
    code?: number;
    msg?: string;
    log_id?: string;
  };
};

type RunFeishuApiCallOptions = {
  /** Feishu error codes that should be treated as transient and retried. */
  retryableCodes?: Iterable<number>;
  /** Retry delays in milliseconds. Number of entries controls retry attempts. */
  backoffMs?: number[];
};

/**
 * Standard tool result payload:
 * - `content` for model-visible text output
 * - `details` for structured downstream access
 */
export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

/** Convert any thrown value into the standard JSON error envelope. */
export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const info = extractFeishuErrorInfo(err);

  if (!info) {
    return json({ error: message });
  }

  return json({
    error: message,
    feishu_error: {
      code: info.code,
      msg: info.msg,
      log_id: info.logId,
    },
  });
}

/** Small async sleep utility used by retry backoff. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract Feishu error fields (`code`, `msg`, `log_id`) from different throw shapes.
 * Handles nested SDK error arrays and axios-style `response.data`.
 */
function extractFeishuErrorInfo(err: unknown): FeishuErrorInfo | null {
  if (!err) return null;

  // Feishu SDK may throw nested array structures like:
  // [axiosError, { code, msg, log_id, ... }]
  if (Array.isArray(err)) {
    for (let i = err.length - 1; i >= 0; i -= 1) {
      const info = extractFeishuErrorInfo(err[i]);
      if (info) return info;
    }
    return null;
  }

  if (typeof err !== "object") return null;

  const obj = err as Record<string, unknown>;
  const codeValue = obj.code;
  const msgValue = obj.msg ?? obj.message;
  const logIdValue = obj.log_id ?? obj.logId;

  const hasCode = typeof codeValue === "number";
  const hasMsg = typeof msgValue === "string";
  const hasLogId = typeof logIdValue === "string";

  if (hasCode || hasMsg || hasLogId) {
    return {
      code: hasCode ? codeValue : undefined,
      msg: hasMsg ? (msgValue as string) : undefined,
      logId: hasLogId ? (logIdValue as string) : undefined,
    };
  }

  const response = obj.response as
    | {
        data?: unknown;
        status?: unknown;
        headers?: Record<string, unknown>;
      }
    | undefined;

  const responseData = response?.data;
  if (responseData) {
    const nested = extractFeishuErrorInfo(responseData);
    if (nested) {
      const headerLogId =
        (response?.headers?.["x-tt-logid"] as string | undefined) ??
        (response?.headers?.["x-log-id"] as string | undefined);
      if (!nested.logId && headerLogId) {
        nested.logId = headerLogId;
      }
      return nested;
    }
  }

  const status = typeof response?.status === "number" ? response.status : undefined;
  const headerLogId =
    (response?.headers?.["x-tt-logid"] as string | undefined) ??
    (response?.headers?.["x-log-id"] as string | undefined);

  if (status !== undefined || headerLogId) {
    return {
      code: status,
      msg: typeof msgValue === "string" ? (msgValue as string) : undefined,
      logId: headerLogId,
    };
  }

  return null;
}

function assertFeishuOk<T extends FeishuApiResponse>(response: T, context: string): T {
  if (response.code === undefined || response.code === 0) return response;

  const message = response.msg || `code ${response.code}`;
  const detail = response.log_id ?? response.logId;
  const error = new Error(
    detail
      ? `${context} failed: ${message}, code=${response.code}, log_id=${detail}`
      : `${context} failed: ${message}, code=${response.code}`,
  ) as FeishuTaggedError;

  error.code = response.code;
  error.msg = response.msg;
  if (detail) {
    error.log_id = detail;
    error.logId = detail;
  }
  error.feishu_error = {
    code: response.code,
    msg: response.msg,
    log_id: detail,
  };

  throw error;
}

/**
 * Normalize unknown errors to a readable, context-aware Error message.
 * Preserves Feishu `code/log_id` details when available.
 */
function toError(err: unknown, context: string): Error {
  const attachFeishuInfo = (error: Error, info: FeishuErrorInfo): Error => {
    const tagged = error as FeishuTaggedError;
    tagged.code = info.code;
    tagged.msg = info.msg;
    if (info.logId) {
      tagged.log_id = info.logId;
      tagged.logId = info.logId;
    }
    tagged.feishu_error = {
      code: info.code,
      msg: info.msg,
      log_id: info.logId,
    };
    return tagged;
  };

  if (err instanceof Error) {
    const info = extractFeishuErrorInfo(err);
    if (!info) return err;
    const details = [
      info.msg || `code ${info.code}`,
      info.code !== undefined ? `code=${info.code}` : undefined,
      info.logId ? `log_id=${info.logId}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    return attachFeishuInfo(new Error(`${context} failed: ${details}`), info);
  }

  const info = extractFeishuErrorInfo(err);
  if (info) {
    const details = [
      info.msg || `code ${info.code}`,
      info.code !== undefined ? `code=${info.code}` : undefined,
      info.logId ? `log_id=${info.logId}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    return attachFeishuInfo(new Error(`${context} failed: ${details}`), info);
  }

  return new Error(`${context} failed: ${String(err)}`);
}

/**
 * Execute a Feishu API call with shared success/error handling.
 *
 * Behavior:
 * - Treats `code === 0` (or undefined) as success.
 * - Converts non-zero responses and thrown values into normalized Errors.
 * - Optionally retries only for configured transient error codes.
 *
 * Retry model:
 * - Attempts = `backoffMs.length + 1`
 * - Delay before each retry uses the corresponding `backoffMs` entry.
 */
export async function runFeishuApiCall<T extends FeishuApiResponse>(
  context: string,
  fn: () => Promise<T>,
  options?: RunFeishuApiCallOptions,
): Promise<T> {
  const retryableCodes = new Set(options?.retryableCodes ?? []);
  const backoffMs = options?.backoffMs ?? [];
  const maxAttempts = backoffMs.length + 1;
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    try {
      const response = await fn();
      return assertFeishuOk(response, context);
    } catch (err) {
      lastErr = err;
      const info = extractFeishuErrorInfo(err);
      const retryable =
        retryableCodes.size > 0 && info?.code !== undefined && retryableCodes.has(info.code);
      const exhausted = attempt >= maxAttempts - 1;
      if (!retryable || exhausted) {
        throw toError(err, context);
      }

      const waitMs = backoffMs[Math.min(attempt, backoffMs.length - 1)];
      await sleep(waitMs);
      attempt += 1;
    }
  }

  throw toError(lastErr, context);
}

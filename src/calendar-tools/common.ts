import { createFeishuClient } from "../client.js";
import {
  errorResult,
  json,
  runFeishuApiCall,
  type FeishuApiResponse,
} from "../tools-common/feishu-api.js";

export type CalendarClient = ReturnType<typeof createFeishuClient>;

export { json, errorResult };

/**
 * 默认时区策略：
 * 1) 参数中显式传入 timezone 时使用该值；
 * 2) 未传时默认使用 Asia/Shanghai（北京时间，UTC+8）；
 */
export const FEISHU_CALENDAR_DEFAULT_TIMEZONE = "Asia/Shanghai";

const ISO_8601_WITH_TZ_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function resolveCalendarTimezone(timezone?: string): string {
  const tz = timezone?.trim();
  return tz && tz.length > 0 ? tz : FEISHU_CALENDAR_DEFAULT_TIMEZONE;
}

export function ensureNonEmpty(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

export function assertIsoDateTime(input: string | undefined, field: string): string | undefined {
  if (input === undefined) return undefined;

  const value = input.trim();
  if (!ISO_8601_WITH_TZ_RE.test(value)) {
    throw new Error(`${field} must be ISO 8601 / RFC3339 with timezone, e.g. 2026-02-25T18:30:00+08:00`);
  }

  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    throw new Error(`${field} is not a valid datetime`);
  }

  return value;
}

export function toEpochSeconds(isoDateTime: string): string {
  return String(Math.floor(Date.parse(isoDateTime) / 1000));
}

export function normalizeCalendarEvent(raw: Record<string, any> | undefined) {
  if (!raw) return undefined;
  return {
    event_id: raw.event_id ?? raw.eventId,
    summary: raw.summary,
    description: raw.description,
    start_time: raw.start_time,
    end_time: raw.end_time,
    status: raw.status,
    organizer: raw.organizer,
    attendees: raw.attendees,
    html_link: raw.html_link ?? raw.htmlLink,
  };
}

export async function runCalendarApiCall<T extends FeishuApiResponse>(
  context: string,
  fn: () => Promise<T>,
): Promise<T> {
  return runFeishuApiCall(context, fn);
}

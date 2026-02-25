import type { CalendarClient } from "./common.js";
import {
  assertIsoDateTime,
  ensureNonEmpty,
  FEISHU_CALENDAR_DEFAULT_TIMEZONE,
  normalizeCalendarEvent,
  resolveCalendarTimezone,
  runCalendarApiCall,
  toEpochSeconds,
} from "./common.js";
import type {
  CalendarCreateEventParams,
  CalendarDeleteEventParams,
  CalendarListEventsParams,
  CalendarUpdateEventParams,
} from "./schemas.js";

function maybeToEpoch(input: string | undefined, field: string): string | undefined {
  const normalized = assertIsoDateTime(input, field);
  if (!normalized) return undefined;
  return toEpochSeconds(normalized);
}

async function resolveCalendarId(client: CalendarClient, calendarId?: string): Promise<string> {
  if (calendarId?.trim()) return ensureNonEmpty(calendarId, "calendar_id");

  const res = await runCalendarApiCall("calendar.v4.calendar.list", () =>
    (client as any).calendar.v4.calendar.list({ params: { page_size: 1 } }),
  );

  const item = (res as any)?.data?.items?.[0];
  const resolved = item?.calendar_id ?? item?.calendarId ?? item?.id;
  if (!resolved) {
    throw new Error("calendar_id is required and no accessible calendar was found for current account");
  }
  return String(resolved);
}

export async function listCalendarEvents(client: CalendarClient, params: CalendarListEventsParams) {
  const calendarId = await resolveCalendarId(client, params.calendar_id);
  const startTime = maybeToEpoch(params.start_time, "start_time");
  const endTime = maybeToEpoch(params.end_time, "end_time");

  if (startTime && endTime && Number(startTime) >= Number(endTime)) {
    throw new Error("start_time must be earlier than end_time");
  }

  const res = await runCalendarApiCall("calendar.v4.calendarEvent.list", () =>
    (client as any).calendar.v4.calendarEvent.list({
      path: { calendar_id: calendarId },
      params: {
        start_time: startTime,
        end_time: endTime,
        page_size: params.page_size,
        page_token: params.page_token,
      },
    }),
  );

  return {
    calendar_id: calendarId,
    timezone: resolveCalendarTimezone(params.timezone),
    default_timezone: FEISHU_CALENDAR_DEFAULT_TIMEZONE,
    items:
      ((res as any)?.data?.items as Array<Record<string, any>> | undefined)?.map((item) =>
        normalizeCalendarEvent(item),
      ) ?? [],
    page_token: (res as any)?.data?.page_token,
    has_more: (res as any)?.data?.has_more,
  };
}

export async function createCalendarEvent(client: CalendarClient, params: CalendarCreateEventParams) {
  const calendarId = ensureNonEmpty(params.calendar_id, "calendar_id");
  const summary = ensureNonEmpty(params.summary, "summary");
  const startIso = assertIsoDateTime(params.start_time, "start_time");
  const endIso = assertIsoDateTime(params.end_time, "end_time");

  if (!startIso || !endIso) {
    throw new Error("start_time and end_time are required");
  }

  const timezone = resolveCalendarTimezone(params.timezone);
  const startTs = toEpochSeconds(startIso);
  const endTs = toEpochSeconds(endIso);

  if (Number(startTs) >= Number(endTs)) {
    throw new Error("start_time must be earlier than end_time");
  }

  const res = await runCalendarApiCall("calendar.v4.calendarEvent.create", () =>
    (client as any).calendar.v4.calendarEvent.create({
      path: { calendar_id: calendarId },
      data: {
        summary,
        description: params.description,
        start_time: {
          timestamp: startTs,
          timezone,
        },
        end_time: {
          timestamp: endTs,
          timezone,
        },
        attendees: params.attendees?.map((attendee) => ({
          attendee_id: attendee.id,
          attendee_id_type: attendee.type,
        })),
      },
    }),
  );

  return {
    calendar_id: calendarId,
    timezone,
    event: normalizeCalendarEvent((res as any)?.data?.event as Record<string, any> | undefined),
  };
}

export async function updateCalendarEvent(client: CalendarClient, params: CalendarUpdateEventParams) {
  const calendarId = ensureNonEmpty(params.calendar_id, "calendar_id");
  const eventId = ensureNonEmpty(params.event_id, "event_id");

  const summary = params.summary?.trim();
  const description = params.description;
  const startIso = assertIsoDateTime(params.start_time, "start_time");
  const endIso = assertIsoDateTime(params.end_time, "end_time");

  const timezone = resolveCalendarTimezone(params.timezone);

  const patchData: Record<string, unknown> = {};
  if (summary !== undefined) patchData.summary = summary;
  if (description !== undefined) patchData.description = description;
  if (startIso) {
    patchData.start_time = {
      timestamp: toEpochSeconds(startIso),
      timezone,
    };
  }
  if (endIso) {
    patchData.end_time = {
      timestamp: toEpochSeconds(endIso),
      timezone,
    };
  }

  if (Object.keys(patchData).length === 0) {
    throw new Error("At least one updatable field is required");
  }

  if (startIso && endIso && Date.parse(startIso) >= Date.parse(endIso)) {
    throw new Error("start_time must be earlier than end_time");
  }

  const res = await runCalendarApiCall("calendar.v4.calendarEvent.patch", () =>
    (client as any).calendar.v4.calendarEvent.patch({
      path: { calendar_id: calendarId, event_id: eventId },
      data: patchData,
    }),
  );

  return {
    calendar_id: calendarId,
    event_id: eventId,
    timezone,
    event: normalizeCalendarEvent((res as any)?.data?.event as Record<string, any> | undefined),
  };
}

export async function deleteCalendarEvent(client: CalendarClient, params: CalendarDeleteEventParams) {
  const calendarId = ensureNonEmpty(params.calendar_id, "calendar_id");
  const eventId = ensureNonEmpty(params.event_id, "event_id");

  if (!params.confirm) {
    throw new Error("Deletion rejected: confirm must be true to execute feishu_calendar_delete_event.");
  }

  await runCalendarApiCall("calendar.v4.calendarEvent.delete", () =>
    (client as any).calendar.v4.calendarEvent.delete({
      path: { calendar_id: calendarId, event_id: eventId },
    }),
  );

  return {
    success: true,
    calendar_id: calendarId,
    event_id: eventId,
    confirm: true,
  };
}

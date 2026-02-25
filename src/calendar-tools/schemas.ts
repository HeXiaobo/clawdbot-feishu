import { Type } from "@sinclair/typebox";

const CalendarDateTimeSchema = Type.String({
  description:
    "Datetime in ISO 8601 / RFC3339 format, e.g. 2026-02-25T18:30:00+08:00",
});

const TimezoneSchema = Type.Optional(
  Type.String({
    description:
      "IANA timezone, e.g. Asia/Shanghai. Default: Asia/Shanghai when omitted.",
  }),
);

export type CalendarListEventsParams = {
  calendar_id?: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  page_size?: number;
  page_token?: string;
};

export type CalendarCreateEventParams = {
  calendar_id: string;
  summary: string;
  description?: string;
  start_time: string;
  end_time: string;
  timezone?: string;
  attendees?: Array<{ id: string; type?: string }>;
};

export type CalendarUpdateEventParams = {
  calendar_id: string;
  event_id: string;
  summary?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
};

export type CalendarDeleteEventParams = {
  calendar_id: string;
  event_id: string;
  confirm: boolean;
};

export const CalendarListEventsSchema = Type.Object({
  calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional, defaults to primary)" })),
  start_time: Type.Optional(CalendarDateTimeSchema),
  end_time: Type.Optional(CalendarDateTimeSchema),
  timezone: TimezoneSchema,
  page_size: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
  page_token: Type.Optional(Type.String()),
});

export const CalendarCreateEventSchema = Type.Object({
  calendar_id: Type.String({ description: "Calendar ID" }),
  summary: Type.String({ description: "Event title" }),
  description: Type.Optional(Type.String({ description: "Event description" })),
  start_time: CalendarDateTimeSchema,
  end_time: CalendarDateTimeSchema,
  timezone: TimezoneSchema,
  attendees: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String({ description: "Attendee ID" }),
        type: Type.Optional(Type.String({ description: "Attendee ID type, e.g. open_id/user_id" })),
      }),
      { description: "Optional attendees" },
    ),
  ),
});

export const CalendarUpdateEventSchema = Type.Object(
  {
    calendar_id: Type.String({ description: "Calendar ID" }),
    event_id: Type.String({ description: "Event ID" }),
    summary: Type.Optional(Type.String({ description: "Updated title" })),
    description: Type.Optional(Type.String({ description: "Updated description" })),
    start_time: Type.Optional(CalendarDateTimeSchema),
    end_time: Type.Optional(CalendarDateTimeSchema),
    timezone: TimezoneSchema,
  },
  { minProperties: 3 },
);

export const CalendarDeleteEventSchema = Type.Object({
  calendar_id: Type.String({ description: "Calendar ID" }),
  event_id: Type.String({ description: "Event ID" }),
  confirm: Type.Boolean({
    description:
      "Safety confirmation for deletion. Must be true, otherwise the tool rejects delete operation.",
  }),
});

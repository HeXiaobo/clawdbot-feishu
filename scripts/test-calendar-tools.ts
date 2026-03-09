import assert from "node:assert/strict";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "../src/calendar-tools/actions.js";

function createMockClient() {
  const calls: Array<{ method: string; payload: any }> = [];

  const client: any = {
    calendar: {
      v4: {
        calendar: {
          list: async (payload: any) => {
            calls.push({ method: "calendar.list", payload });
            return {
              code: 0,
              data: {
                items: [{ calendar_id: "cal_primary" }],
              },
            };
          },
        },
        calendarEvent: {
          list: async (payload: any) => {
            calls.push({ method: "calendarEvent.list", payload });
            return {
              code: 0,
              data: {
                items: [{ event_id: "evt_1", summary: "Demo" }],
                has_more: false,
                page_token: "",
              },
            };
          },
          create: async (payload: any) => {
            calls.push({ method: "calendarEvent.create", payload });
            return {
              code: 0,
              data: {
                event: {
                  event_id: "evt_new",
                  summary: payload.data.summary,
                },
              },
            };
          },
          patch: async (payload: any) => {
            calls.push({ method: "calendarEvent.patch", payload });
            return {
              code: 0,
              data: {
                event: {
                  event_id: payload.path.event_id,
                  summary: payload.data.summary ?? "unchanged",
                },
              },
            };
          },
          delete: async (payload: any) => {
            calls.push({ method: "calendarEvent.delete", payload });
            return { code: 0, data: {} };
          },
        },
      },
    },
  };

  return { client, calls };
}

async function main() {
  const { client, calls } = createMockClient();

  const listRes = await listCalendarEvents(client, {
    start_time: "2026-02-25T10:00:00+08:00",
    end_time: "2026-02-25T11:00:00+08:00",
    page_size: 10,
  });
  assert.equal(listRes.calendar_id, "cal_primary");
  assert.equal(listRes.items.length, 1);

  const createRes = await createCalendarEvent(client, {
    calendar_id: "cal_primary",
    summary: "发布验收会",
    description: "可乐先验收前自测",
    start_time: "2026-02-25T14:00:00+08:00",
    end_time: "2026-02-25T15:00:00+08:00",
    timezone: "Asia/Shanghai",
  });
  assert.equal(createRes.event?.event_id, "evt_new");

  const updateRes = await updateCalendarEvent(client, {
    calendar_id: "cal_primary",
    event_id: "evt_new",
    summary: "发布验收会-更新",
  });
  assert.equal(updateRes.event?.event_id, "evt_new");

  const deleteRes = await deleteCalendarEvent(client, {
    calendar_id: "cal_primary",
    event_id: "evt_new",
    confirm: true,
  });
  assert.equal(deleteRes.success, true);

  await assert.rejects(
    () =>
      deleteCalendarEvent(client, {
        calendar_id: "cal_primary",
        event_id: "evt_new",
        confirm: false,
      }),
    /confirm must be true/i,
  );

  assert(calls.some((c) => c.method === "calendar.list"));
  assert(calls.some((c) => c.method === "calendarEvent.list"));
  assert(calls.some((c) => c.method === "calendarEvent.create"));
  assert(calls.some((c) => c.method === "calendarEvent.patch"));
  assert(calls.some((c) => c.method === "calendarEvent.delete"));

  console.log("[ok] calendar tools call-chain test passed");
}

main().catch((err) => {
  console.error("[fail] calendar tools test failed:", err);
  process.exit(1);
});

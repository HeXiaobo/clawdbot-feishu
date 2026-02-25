import type { TSchema } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { hasFeishuToolEnabledForAnyAccount, withFeishuToolClient } from "../tools-common/tool-exec.js";
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, updateCalendarEvent } from "./actions.js";
import { errorResult, json, type CalendarClient } from "./common.js";
import {
  CalendarCreateEventSchema,
  type CalendarCreateEventParams,
  CalendarDeleteEventSchema,
  type CalendarDeleteEventParams,
  CalendarListEventsSchema,
  type CalendarListEventsParams,
  CalendarUpdateEventSchema,
  type CalendarUpdateEventParams,
} from "./schemas.js";

type ToolSpec<P> = {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  run: (client: CalendarClient, params: P) => Promise<unknown>;
};

function registerCalendarTool<P>(api: OpenClawPluginApi, spec: ToolSpec<P>) {
  api.registerTool(
    {
      name: spec.name,
      label: spec.label,
      description: spec.description,
      parameters: spec.parameters,
      async execute(_toolCallId, params) {
        try {
          return await withFeishuToolClient({
            api,
            toolName: spec.name,
            requiredTool: "calendar",
            run: async ({ client }) => json(await spec.run(client as CalendarClient, params as P)),
          });
        } catch (err) {
          return errorResult(err);
        }
      },
    },
    { name: spec.name },
  );
}

export function registerFeishuCalendarTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_calendar: No config available, skipping calendar tools");
    return;
  }

  if (!hasFeishuToolEnabledForAnyAccount(api.config)) {
    api.logger.debug?.("feishu_calendar: No Feishu accounts configured, skipping calendar tools");
    return;
  }

  if (!hasFeishuToolEnabledForAnyAccount(api.config, "calendar")) {
    api.logger.debug?.("feishu_calendar: calendar tools disabled in config");
    return;
  }

  registerCalendarTool<CalendarListEventsParams>(api, {
    name: "feishu_calendar_list_events",
    label: "Feishu Calendar List Events",
    description: "List calendar events",
    parameters: CalendarListEventsSchema,
    run: (client, params) => listCalendarEvents(client, params),
  });

  registerCalendarTool<CalendarCreateEventParams>(api, {
    name: "feishu_calendar_create_event",
    label: "Feishu Calendar Create Event",
    description: "Create a calendar event",
    parameters: CalendarCreateEventSchema,
    run: (client, params) => createCalendarEvent(client, params),
  });

  registerCalendarTool<CalendarUpdateEventParams>(api, {
    name: "feishu_calendar_update_event",
    label: "Feishu Calendar Update Event",
    description: "Update a calendar event",
    parameters: CalendarUpdateEventSchema,
    run: (client, params) => updateCalendarEvent(client, params),
  });

  registerCalendarTool<CalendarDeleteEventParams>(api, {
    name: "feishu_calendar_delete_event",
    label: "Feishu Calendar Delete Event",
    description: "Delete a calendar event (requires confirm=true)",
    parameters: CalendarDeleteEventSchema,
    run: (client, params) => deleteCalendarEvent(client, params),
  });

  api.logger.debug?.("feishu_calendar: Registered 4 calendar tools");
}

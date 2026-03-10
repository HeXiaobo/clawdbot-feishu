import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeishuCalendarTools } from "../register.js";
import { listCalendarEvents } from "../actions.js";
import { withFeishuToolClient } from "../../tools-common/tool-exec.js";

vi.mock("../actions.js", () => ({
  listCalendarEvents: vi.fn(async () => ({ items: [] })),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock("../../tools-common/tool-exec.js", () => ({
  hasFeishuToolEnabledForAnyAccount: vi.fn(() => true),
  withFeishuToolClient: vi.fn(),
}));

describe("calendar register contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given useUserToken execution, When calendar tool runs, Then forwards userAccessToken to action handlers", async () => {
    const registerTool = vi.fn();
    const api = {
      config: { channels: { feishu: { appId: "id", appSecret: "secret" } } },
      logger: {},
      registerTool,
    } as any;

    vi.mocked(withFeishuToolClient).mockImplementation(async ({ run }: any) =>
      run({
        client: { kind: "calendar-client" },
        account: { accountId: "default" },
        userAccessToken: "user-token",
      }),
    );

    registerFeishuCalendarTools(api);

    const listTool = registerTool.mock.calls.find((call) => call[0].name === "feishu_calendar_list_events")?.[0];
    expect(listTool).toBeDefined();

    await listTool.execute("tool-call-id", {
      action: "list",
      calendar_id: "cal-1",
      useUserToken: true,
    });

    expect(listCalendarEvents).toHaveBeenCalledWith(
      { kind: "calendar-client" },
      expect.objectContaining({ calendar_id: "cal-1", useUserToken: true }),
      { userAccessToken: "user-token" },
    );
  });
});

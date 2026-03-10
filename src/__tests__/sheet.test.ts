import { describe, expect, it, vi } from "vitest";
import { registerFeishuSheetTools } from "../sheet.js";

describe("sheet registration contract", () => {
  it("Given the first account disables sheet but another enables it, When registering tools, Then sheet still registers globally", () => {
    const registerTool = vi.fn();
    const api = {
      config: {
        channels: {
          feishu: {
            accounts: {
              a1: {
                enabled: true,
                appId: "id-a1",
                appSecret: "secret-a1",
                tools: { sheet: false },
              },
              a2: {
                enabled: true,
                appId: "id-a2",
                appSecret: "secret-a2",
                tools: { sheet: true },
              },
            },
          },
        },
      },
      logger: {},
      registerTool,
    } as any;

    registerFeishuSheetTools(api);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "feishu_sheet" }),
      expect.objectContaining({ name: "feishu_sheet" }),
    );
  });
});

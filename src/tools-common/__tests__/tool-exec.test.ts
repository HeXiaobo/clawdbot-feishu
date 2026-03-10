import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFeishuClient, getUserAccessToken } from "../../client.js";
import { runWithFeishuToolContext } from "../tool-context.js";
import {
  hasFeishuToolEnabledForAnyAccount,
  resolveToolAccount,
  withFeishuToolClient,
} from "../tool-exec.js";

vi.mock("../../client.js", () => ({
  createFeishuClient: vi.fn(() => ({ kind: "mock-client" })),
  getUserAccessToken: vi.fn(),
  clearUserTokenCache: vi.fn(),
}));

describe("tool-exec contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given multiple enabled accounts, When checking tool flags, Then returns true if any account enables the tool", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            a1: {
              enabled: true,
              appId: "id-a1",
              appSecret: "secret-a1",
              tools: { doc: false, task: true },
            },
            a2: {
              enabled: true,
              appId: "id-a2",
              appSecret: "secret-a2",
              tools: { doc: true, task: false },
            },
          },
        },
      },
    } as any;

    expect(hasFeishuToolEnabledForAnyAccount(cfg)).toBe(true);
    expect(hasFeishuToolEnabledForAnyAccount(cfg, "doc")).toBe(true);
    expect(hasFeishuToolEnabledForAnyAccount(cfg, "task")).toBe(true);
    expect(hasFeishuToolEnabledForAnyAccount(cfg, "perm")).toBe(false);
  });

  it("Given context account and default path, When resolving tool account, Then context wins and fallback uses default", () => {
    const cfg = {
      channels: {
        feishu: {
          appId: "base-app",
          appSecret: "base-secret",
          accounts: {
            teama: { appId: "id-a", appSecret: "secret-a" },
            teamb: { appId: "id-b", appSecret: "secret-b" },
          },
        },
      },
    } as any;

    const fromContext = runWithFeishuToolContext({ channel: "feishu", accountId: "teamb" }, () =>
      resolveToolAccount(cfg),
    );
    expect(fromContext.accountId).toBe("teamb");

    const fromDefault = resolveToolAccount({ channels: { feishu: { appId: "x", appSecret: "y" } } } as any);
    expect(fromDefault.accountId).toBe(DEFAULT_ACCOUNT_ID);
  });

  it("Given invalid tool execution state, When running withFeishuToolClient, Then throws explicit errors", async () => {
    await expect(
      withFeishuToolClient({
        api: {} as any,
        toolName: "feishu_doc",
        run: async () => "ok",
      }),
    ).rejects.toThrowError("Feishu config is not available");

    await expect(
      withFeishuToolClient({
        api: {
          config: { channels: { feishu: { enabled: false, appId: "x", appSecret: "y" } } },
        } as any,
        toolName: "feishu_doc",
        run: async () => "ok",
      }),
    ).rejects.toThrowError(/is disabled/);

    await expect(
      withFeishuToolClient({
        api: { config: { channels: { feishu: { enabled: true } } } } as any,
        toolName: "feishu_doc",
        run: async () => "ok",
      }),
    ).rejects.toThrowError(/is not configured/);
  });

  it("Given required tool flag, When enabled, Then executes callback with client and resolved account", async () => {
    await expect(
      withFeishuToolClient({
        api: {
          config: {
            channels: {
              feishu: {
                enabled: true,
                appId: "id",
                appSecret: "secret",
                tools: { doc: false },
              },
            },
          },
        } as any,
        toolName: "feishu_doc",
        requiredTool: "doc",
        run: async () => "ok",
      }),
    ).rejects.toThrowError(/is disabled/);

    const result = await withFeishuToolClient({
      api: {
        config: {
          channels: {
            feishu: {
              enabled: true,
              appId: "id",
              appSecret: "secret",
              tools: { doc: true },
            },
          },
        },
      } as any,
      toolName: "feishu_doc",
      requiredTool: "doc",
      run: async ({ client, account }) => {
        expect(client).toEqual({ kind: "mock-client" });
        expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
        return "done";
      },
    });

    expect(result).toBe("done");
    expect(vi.mocked(createFeishuClient)).toHaveBeenCalledTimes(1);
  });

  it("Given user-token execution fails, When fallback is disabled, Then does not rerun side effects with tenant token", async () => {
    vi.mocked(getUserAccessToken).mockResolvedValue("user-token");
    const run = vi.fn(async () => {
      throw new Error("write failed after side effect");
    });

    await expect(
      withFeishuToolClient({
        api: {
          config: {
            channels: {
              feishu: {
                enabled: true,
                appId: "id",
                appSecret: "secret",
              },
            },
          },
          logger: {},
        } as any,
        toolName: "feishu_sheet",
        useUserToken: true,
        run,
      }),
    ).rejects.toThrowError("write failed after side effect");

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("Given user-token execution fails, When fallback is enabled, Then retries with tenant token once", async () => {
    vi.mocked(getUserAccessToken).mockResolvedValue("user-token");
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("user token rejected"))
      .mockResolvedValueOnce("tenant-success");

    const result = await withFeishuToolClient({
      api: {
        config: {
          channels: {
            feishu: {
              enabled: true,
              appId: "id",
              appSecret: "secret",
            },
          },
        },
        logger: { debug: vi.fn() },
      } as any,
      toolName: "feishu_doc",
      useUserToken: true,
      allowUserTokenFallback: true,
      run,
    });

    expect(result).toBe("tenant-success");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userAccessToken: "user-token" }),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userAccessToken: undefined, userTokenClient: undefined }),
    );
  });
});

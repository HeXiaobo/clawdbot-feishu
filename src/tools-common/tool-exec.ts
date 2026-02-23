import type * as Lark from "@larksuiteoapi/node-sdk";
import type { ClawdbotConfig, OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  listEnabledFeishuAccounts,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
} from "../accounts.js";
import { createFeishuClient, getUserAccessToken } from "../client.js";
import { resolveToolsConfig } from "../tools-config.js";
import { getCurrentFeishuToolContext } from "./tool-context.js";
import type { FeishuToolsConfig, ResolvedFeishuAccount } from "../types.js";

export type FeishuToolFlag = keyof Required<FeishuToolsConfig>;

export function hasFeishuToolEnabledForAnyAccount(
  cfg: ClawdbotConfig,
  requiredTool?: FeishuToolFlag,
): boolean {
  // Tool registration is global (one definition), so we only need to know whether
  // at least one enabled account can use the tool.
  const accounts = listEnabledFeishuAccounts(cfg);
  if (accounts.length === 0) {
    return false;
  }
  if (!requiredTool) {
    return true;
  }
  return accounts.some((account) => resolveToolsConfig(account.config.tools)[requiredTool]);
}

export function resolveToolAccount(cfg: ClawdbotConfig): ResolvedFeishuAccount {
  const context = getCurrentFeishuToolContext();
  if (context?.channel === "feishu" && context.accountId) {
    // Message-driven path: use the account from AsyncLocalStorage context.
    return resolveFeishuAccount({ cfg, accountId: context.accountId });
  }
  // Non-session path (e.g. background/manual invocation): fall back to default account.
  return resolveFeishuAccount({ cfg, accountId: resolveDefaultFeishuAccountId(cfg) });
}

/**
 * HTTP client for user token requests
 */
export interface UserTokenHttpClient {
  get: (url: string) => Promise<any>;
  post: (url: string, body?: any) => Promise<any>;
}

/**
 * Create HTTP client with user token
 */
function createUserTokenClient(userToken: string, domain: string): UserTokenHttpClient {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  
  async function request(method: string, url: string, body?: any): Promise<any> {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${userToken}`,
      "Content-Type": "application/json",
    };
    
    const fetchOptions: RequestInit = { method, headers };
    
    if (body) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    
    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.json();
    
    if (!response.ok || data.code !== 0) {
      throw new Error(data.msg || `HTTP ${response.status}`);
    }
    
    return data;
  }
  
  return {
    get: (url: string) => request("GET", url),
    post: (url: string, body?: any) => request("POST", url, body),
  };
}

/**
 * Execute tool with user token (for external docs) with fallback to tenant token
 */
export async function withFeishuToolClient<T>(params: {
  api: OpenClawPluginApi;
  toolName: string;
  requiredTool?: FeishuToolFlag;
  useUserToken?: boolean; // Enable user token for external doc reading
  run: (args: { 
    client: Lark.Client; 
    account: ResolvedFeishuAccount;
    userTokenClient?: UserTokenHttpClient;
  }) => Promise<T>;
}): Promise<T> {
  if (!params.api.config) {
    throw new Error("Feishu config is not available");
  }

  // Resolve account at execution time (not registration time).
  const account = resolveToolAccount(params.api.config);

  if (!account.enabled) {
    throw new Error(`Feishu account "${account.accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" is not configured`);
  }

  if (params.requiredTool) {
    // Enforce per-account tool toggles, even though the tool is registered globally.
    const toolsCfg = resolveToolsConfig(account.config.tools);
    if (!toolsCfg[params.requiredTool]) {
      throw new Error(
        `Feishu tool "${params.toolName}" is disabled for account "${account.accountId}"`,
      );
    }
  }

  // Check if user token should be used (for external doc reading)
  let userTokenClient: UserTokenHttpClient | undefined;
  
  if (params.useUserToken) {
    try {
      const userToken = await getUserAccessToken(account.accountId);
      if (userToken) {
        const domain = account.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
        userTokenClient = createUserTokenClient(userToken, domain);

        // Try with user token first
        try {
          return await params.run({
            client: createFeishuClient(account),
            account,
            userTokenClient,
          });
        } catch (userTokenErr) {
          // User token failed, log and fallback to tenant token
          params.api.logger.debug?.(
            `User token failed for ${params.toolName}, falling back to tenant token: ${userTokenErr}`,
          );
          userTokenClient = undefined;
        }
      } else {
        params.api.logger.debug?.(`User token unavailable for ${params.toolName}, using tenant token`);
      }
    } catch (err) {
      params.api.logger.debug?.(`User token error for ${params.toolName}: ${err}`);
    }
  }

  // Fall back to tenant token (default behavior)
  const client = createFeishuClient(account);
  return params.run({ client, account, userTokenClient: undefined });
}

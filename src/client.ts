import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuDomain, ResolvedFeishuAccount, FeishuUserAuth } from "./types.js";

// Multi-account client cache
const clientCache = new Map<
  string,
  {
    client: Lark.Client;
    config: { appId: string; appSecret: string; domain?: FeishuDomain };
  }
>();

// User token cache with expiration
interface UserTokenCache {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresAt: number; // timestamp in ms
  appId: string;
  appSecret: string;
  domain?: FeishuDomain;
}

const userTokenCache = new Map<string, UserTokenCache>();

function resolveDomain(domain: FeishuDomain | undefined): Lark.Domain | string {
  if (domain === "lark") return Lark.Domain.Lark;
  if (domain === "feishu" || !domain) return Lark.Domain.Feishu;
  return domain.replace(/\/+$/, ""); // Custom URL for private deployment
}

/**
 * Check if user token is expired or about to expire (within 10 minutes)
 */
function isTokenExpired(cache: UserTokenCache): boolean {
  const bufferMs = 10 * 60 * 1000; // 10 minutes buffer
  return Date.now() + bufferMs >= cache.expiresAt;
}

/**
 * Refresh user access token using refresh_token
 */
async function refreshUserToken(cache: UserTokenCache): Promise<UserTokenCache | null> {
  try {
    const domain = resolveDomain(cache.domain);
    const baseUrl = typeof domain === "string" ? domain : (domain === Lark.Domain.Lark ? "https://open.larksuite.com" : "https://open.feishu.cn");
    
    const response = await fetch(`${baseUrl}/open-apis/authen/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: cache.refreshToken,
        client_id: cache.appId,
        client_secret: cache.appSecret,
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh user token:", await response.text());
      return null;
    }

    const data = await response.json();
    if (data.code !== 0) {
      console.error("Refresh token error:", data.msg);
      return null;
    }

    const expiresInMs = (data.expires_in || 7200) * 1000;
    return {
      ...cache,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || cache.refreshToken, // Some implementations return same refresh token
      expiresAt: Date.now() + expiresInMs,
    };
  } catch (err) {
    console.error("Error refreshing user token:", err);
    return null;
  }
}

/**
 * Initialize user token cache from account config
 */
export function initUserTokenCache(accountId: string, userAuth: FeishuUserAuth, appCredentials: { appId: string; appSecret: string; domain?: FeishuDomain }): void {
  if (!userAuth.enabled || !userAuth.accessToken) {
    userTokenCache.delete(accountId);
    return;
  }

  const expiresAt = userAuth.expiresAt 
    ? new Date(userAuth.expiresAt).getTime() 
    : Date.now() + 2 * 60 * 60 * 1000; // Default 2 hours

  userTokenCache.set(accountId, {
    accessToken: userAuth.accessToken,
    refreshToken: userAuth.refreshToken,
    openId: userAuth.openId || "",
    expiresAt,
    appId: appCredentials.appId,
    appSecret: appCredentials.appSecret,
    domain: appCredentials.domain,
  });
}

/**
 * Get user access token (with auto-refresh if needed)
 */
export async function getUserAccessToken(accountId: string): Promise<string | null> {
  const cache = userTokenCache.get(accountId);
  if (!cache) return null;

  // Check if token needs refresh
  if (isTokenExpired(cache)) {
    const refreshed = await refreshUserToken(cache);
    if (refreshed) {
      userTokenCache.set(accountId, refreshed);
      return refreshed.accessToken;
    }
    // Refresh failed, clear cache
    userTokenCache.delete(accountId);
    return null;
  }

  return cache.accessToken;
}

/**
 * Check if user auth is available for account
 */
export function hasUserAuth(accountId: string): boolean {
  const cache = userTokenCache.get(accountId);
  if (!cache) return false;
  // Also check if not expired (without triggering refresh)
  return Date.now() < cache.expiresAt;
}

/**
 * Credentials needed to create a Feishu client.
 * Both FeishuConfig and ResolvedFeishuAccount satisfy this interface.
 */
export type FeishuClientCredentials = {
  accountId?: string;
  appId?: string;
  appSecret?: string;
  domain?: FeishuDomain;
};

/**
 * Create or get a cached Feishu client for an account.
 * Accepts any object with appId, appSecret, and optional domain/accountId.
 */
export function createFeishuClient(creds: FeishuClientCredentials): Lark.Client {
  const { accountId = "default", appId, appSecret, domain } = creds;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  // Check cache
  const cached = clientCache.get(accountId);
  if (
    cached &&
    cached.config.appId === appId &&
    cached.config.appSecret === appSecret &&
    cached.config.domain === domain
  ) {
    return cached.client;
  }

  // Create new client
  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });

  // Cache it
  clientCache.set(accountId, {
    client,
    config: { appId, appSecret, domain },
  });

  return client;
}

/**
 * Create a Feishu WebSocket client for an account.
 * Note: WSClient is not cached since each call creates a new connection.
 */
export function createFeishuWSClient(account: ResolvedFeishuAccount): Lark.WSClient {
  const { accountId, appId, appSecret, domain } = account;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  return new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveDomain(domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
}

/**
 * Create an event dispatcher for an account.
 */
export function createEventDispatcher(account: ResolvedFeishuAccount): Lark.EventDispatcher {
  return new Lark.EventDispatcher({
    encryptKey: account.encryptKey,
    verificationToken: account.verificationToken,
  });
}

/**
 * Get a cached client for an account (if exists).
 */
export function getFeishuClient(accountId: string): Lark.Client | null {
  return clientCache.get(accountId)?.client ?? null;
}

/**
 * Clear client cache for a specific account or all accounts.
 */
export function clearClientCache(accountId?: string): void {
  if (accountId) {
    clientCache.delete(accountId);
  } else {
    clientCache.clear();
  }
}

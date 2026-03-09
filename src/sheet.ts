import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { ResolvedFeishuAccount } from "./types.js";
import { FeishuSheetSchema, type FeishuSheetParams } from "./sheet-schema.js";
import { resolveToolsConfig } from "./tools-config.js";
import { withFeishuToolClient, type UserTokenHttpClient } from "./tools-common/tool-exec.js";
import { listEnabledFeishuAccounts } from "./accounts.js";

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

/** Safely convert cell value to string, handling null/undefined/objects */
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") return JSON.stringify(cell);
  return String(cell).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Convert 2D array to markdown table format */
function formatAsTable(data: unknown[][]): string {
  if (!data || data.length === 0) {
    return "*No data*";
  }

  const header = data[0];
  // Filter out null/empty trailing columns
  let lastValidCol = header.length - 1;
  while (lastValidCol >= 0 && (header[lastValidCol] === null || header[lastValidCol] === undefined)) {
    lastValidCol--;
  }
  if (lastValidCol < 0) return "*No data (empty header)*";

  const validCols = lastValidCol + 1;
  const headerStr = header.slice(0, validCols).map(cellToString);
  const rows = data.slice(1);

  let result = "| " + headerStr.join(" | ") + " |\n";
  result += "| " + headerStr.map(() => "---").join(" | ") + " |\n";

  for (const row of rows) {
    // Skip completely empty rows
    const rowSlice = (row || []).slice(0, validCols);
    if (rowSlice.every((c: unknown) => c === null || c === undefined || c === "")) continue;
    const cells = [];
    for (let i = 0; i < validCols; i++) {
      cells.push(cellToString(i < rowSlice.length ? rowSlice[i] : ""));
    }
    result += "| " + cells.join(" | ") + " |\n";
  }

  return result;
}

/** Column number to letter (1=A, 26=Z, 27=AA, etc.) */
function colToLetter(col: number): string {
  let result = "";
  while (col > 0) {
    col--;
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }
  return result;
}

function resolveOpenApiBase(domain?: string): string {
  if (!domain || domain === "feishu") return "https://open.feishu.cn";
  if (domain === "lark") return "https://open.larksuite.com";
  if (domain.startsWith("http://") || domain.startsWith("https://")) return domain.replace(/\/+$/, "");
  return `https://${domain.replace(/\/+$/, "")}`;
}

function createBearerHttpClient(accessToken: string, baseUrl: string): UserTokenHttpClient {
  async function request(method: string, url: string, body?: any): Promise<any> {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = { method, headers };
    if (body !== undefined) {
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
    put: (url: string, body?: any) => request("PUT", url, body),
  };
}

async function createTenantHttpClient(account: ResolvedFeishuAccount): Promise<UserTokenHttpClient> {
  const baseUrl = resolveOpenApiBase(account.domain);
  if (!account.appId || !account.appSecret) {
    throw new Error(`Feishu credentials missing for account ${account.accountId}`);
  }

  const tokenResp = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: account.appId, app_secret: account.appSecret }),
  });

  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || tokenData.code !== 0 || !tokenData.tenant_access_token) {
    throw new Error(tokenData.msg || `Failed to get tenant access token (HTTP ${tokenResp.status})`);
  }

  return createBearerHttpClient(tokenData.tenant_access_token, baseUrl);
}

// ============ Actions ============

/** Get all sheets in a spreadsheet */
async function listSheets(httpClient: UserTokenHttpClient, spreadsheetToken: string) {
  const url = `/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`;
  const res: any = await httpClient.get(url);

  const sheets = res.data?.sheets ?? [];
  return {
    spreadsheet_token: spreadsheetToken,
    sheets: sheets.map((s: any) => ({
      sheet_id: s.sheet_id,
      title: s.title,
      index: s.index,
      row_count: s.grid_properties?.row_count ?? 0,
      column_count: s.grid_properties?.column_count ?? 0,
    })),
    total: sheets.length,
  };
}

/** Read data from a specific range */
async function readRange(httpClient: UserTokenHttpClient, spreadsheetToken: string, range: string) {
  const encodedRange = encodeURIComponent(range);
  const url = `/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}?valueRenderOption=ToString&dateTimeRenderOption=FormattedString`;
  const res: any = await httpClient.get(url);

  // API returns camelCase: valueRange (not value_range)
  const valueRange = res.data?.valueRange ?? res.data?.value_range ?? {};
  const values = valueRange.values ?? [];
  const rangeInfo = valueRange.range || range;

  return {
    spreadsheet_token: spreadsheetToken,
    range: rangeInfo,
    data: values,
    row_count: values.length,
    column_count: values.length > 0 ? values[0].length : 0,
    table: formatAsTable(values),
  };
}

/** Read all data from a sheet */
async function readAll(httpClient: UserTokenHttpClient, spreadsheetToken: string, sheetId?: string) {
  // Get sheet metadata
  const sheetsInfo = await listSheets(httpClient, spreadsheetToken);
  if (sheetsInfo.sheets.length === 0) {
    throw new Error("No sheets found in this spreadsheet");
  }

  // Find target sheet
  let targetSheet;
  if (sheetId) {
    targetSheet = sheetsInfo.sheets.find((s: any) => s.sheet_id === sheetId);
    if (!targetSheet) {
      throw new Error(
        `Sheet "${sheetId}" not found. Available: ${sheetsInfo.sheets
          .map((s: any) => `${s.sheet_id} (${s.title})`)
          .join(", ")}`,
      );
    }
  } else {
    targetSheet = sheetsInfo.sheets[0];
  }

  // Use actual dimensions, capped at 100 columns (API limit)
  const maxCol = Math.min(targetSheet.column_count || 26, 100);
  const maxRow = targetSheet.row_count || 1000;
  const endCol = colToLetter(maxCol);
  const range = `${targetSheet.sheet_id}!A1:${endCol}${maxRow}`;

  const result = await readRange(httpClient, spreadsheetToken, range);

  return {
    ...result,
    sheet_id: targetSheet.sheet_id,
    sheet_title: targetSheet.title,
  };
}

/** Write values to a specific range */
async function writeRange(
  httpClient: UserTokenHttpClient,
  spreadsheetToken: string,
  range: string,
  values: unknown[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("values must be a non-empty 2D array");
  }

  const encodedRange = encodeURIComponent(range);
  const previewUrl = `/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}?valueRenderOption=ToString&dateTimeRenderOption=FormattedString`;
  const writeUrl = `/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values?valueInputOption=${encodeURIComponent(valueInputOption)}`;

  const writeResp: any = await httpClient.put(writeUrl, {
    valueRange: {
      range,
      values,
    },
  });

  const readBack: any = await httpClient.get(previewUrl);
  const valueRange = readBack.data?.valueRange ?? readBack.data?.value_range ?? {};

  return {
    spreadsheet_token: spreadsheetToken,
    range: writeResp.data?.updatedRange ?? range,
    value_input_option: valueInputOption,
    updated_rows: writeResp.data?.updatedRows ?? 0,
    updated_columns: writeResp.data?.updatedColumns ?? 0,
    updated_cells: writeResp.data?.updatedCells ?? 0,
    revision: writeResp.data?.revision,
    read_back: valueRange.values ?? [],
    table: formatAsTable(valueRange.values ?? []),
  };
}

// ============ Tool Registration ============

export function registerFeishuSheetTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_sheet: No config available, skipping sheet tools");
    return;
  }

  const accounts = listEnabledFeishuAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("feishu_sheet: No Feishu accounts configured, skipping sheet tools");
    return;
  }

  const firstAccount = accounts[0];
  const toolsCfg = resolveToolsConfig(firstAccount.config.tools);

  if (!toolsCfg.sheet) {
    api.logger.debug?.("feishu_sheet: sheet tool disabled in config");
    return;
  }

  api.registerTool(
    {
      name: "feishu_sheet",
      label: "Feishu Sheet",
      description:
        "Feishu spreadsheet (电子表格) operations. Read/write cell data from Sheets (not Bitable). " +
        "Actions: sheets (list worksheets), read (read range), read_all (read entire sheet), write_range (write/update cells). " +
        "Use wiki get first to resolve wiki URLs to spreadsheet_token (obj_token). " +
        "Set useUserToken=true to access external tenant docs with user OAuth.",
      parameters: FeishuSheetSchema,
      async execute(_toolCallId, params) {
        const p = params as FeishuSheetParams;
        try {
          const result = await withFeishuToolClient({
            api,
            toolName: "feishu_sheet",
            requiredTool: "sheet",
            useUserToken: p.useUserToken,
            run: async ({ account, userTokenClient }) => {
              const httpClient = userTokenClient ?? (await createTenantHttpClient(account));

              switch (p.action) {
                case "sheets":
                  return json(await listSheets(httpClient, p.spreadsheet_token));
                case "read":
                  return json(await readRange(httpClient, p.spreadsheet_token, p.range));
                case "read_all":
                  return json(await readAll(httpClient, p.spreadsheet_token, p.sheet_id));
                case "write_range":
                  return json(
                    await writeRange(
                      httpClient,
                      p.spreadsheet_token,
                      p.range,
                      p.values,
                      p.valueInputOption ?? "USER_ENTERED",
                    ),
                  );
                default:
                  return json({ error: `Unknown action: ${(p as any).action}` });
              }
            },
          });
          return result;
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "feishu_sheet" },
  );

  api.logger.info?.("feishu_sheet: Registered feishu_sheet tool");
}

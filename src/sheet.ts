import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createFeishuClient } from "./client.js";
import { listEnabledFeishuAccounts } from "./accounts.js";
import type * as Lark from "@larksuiteoapi/node-sdk";
import { FeishuSheetSchema, type FeishuSheetParams } from "./sheet-schema.js";
import { resolveToolsConfig } from "./tools-config.js";

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

/** Get HTTP client from Lark client */
function getHttpClient(client: Lark.Client) {
  const domain = (client as any).domain ?? "https://open.feishu.cn";
  const http = (client as any).httpInstance;
  return { domain, http };
}

// ============ Actions ============

/** Get all sheets in a spreadsheet */
async function listSheets(client: Lark.Client, spreadsheetToken: string) {
  const { domain, http } = getHttpClient(client);

  const res = await http.get(
    `${domain}/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`
  );

  if (res.code !== 0) {
    throw new Error(`Failed to list sheets: ${res.msg}`);
  }

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
async function readRange(client: Lark.Client, spreadsheetToken: string, range: string) {
  const { domain, http } = getHttpClient(client);

  const encodedRange = encodeURIComponent(range);
  // Append query params directly to URL (httpInstance may not support params object)
  const url = `${domain}/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}?valueRenderOption=ToString&dateTimeRenderOption=FormattedString`;
  const res = await http.get(url);

  if (res.code !== 0) {
    throw new Error(`Failed to read range: ${res.msg}`);
  }

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
async function readAll(
  client: Lark.Client,
  spreadsheetToken: string,
  sheetId?: string
) {
  // Get sheet metadata
  const sheetsInfo = await listSheets(client, spreadsheetToken);
  if (sheetsInfo.sheets.length === 0) {
    throw new Error("No sheets found in this spreadsheet");
  }

  // Find target sheet
  let targetSheet;
  if (sheetId) {
    targetSheet = sheetsInfo.sheets.find((s: any) => s.sheet_id === sheetId);
    if (!targetSheet) {
      throw new Error(`Sheet "${sheetId}" not found. Available: ${sheetsInfo.sheets.map((s: any) => `${s.sheet_id} (${s.title})`).join(", ")}`);
    }
  } else {
    targetSheet = sheetsInfo.sheets[0];
  }

  // Use actual dimensions, capped at 100 columns (API limit)
  const maxCol = Math.min(targetSheet.column_count || 26, 100);
  const maxRow = targetSheet.row_count || 1000;
  const endCol = colToLetter(maxCol);
  const range = `${targetSheet.sheet_id}!A1:${endCol}${maxRow}`;

  const result = await readRange(client, spreadsheetToken, range);

  return {
    ...result,
    sheet_id: targetSheet.sheet_id,
    sheet_title: targetSheet.title,
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

  const getClient = () => createFeishuClient(firstAccount);

  api.registerTool(
    {
      name: "feishu_sheet",
      label: "Feishu Sheet",
      description:
        "Feishu spreadsheet (电子表格) operations. Read cell data from Sheets (not Bitable). " +
        "Actions: sheets (list worksheets), read (read range), read_all (read entire sheet). " +
        "Use wiki get first to resolve wiki URLs to spreadsheet_token (obj_token).",
      parameters: FeishuSheetSchema,
      async execute(_toolCallId, params) {
        const p = params as FeishuSheetParams;
        try {
          const client = getClient();
          switch (p.action) {
            case "sheets":
              return json(await listSheets(client, p.spreadsheet_token));
            case "read":
              return json(await readRange(client, p.spreadsheet_token, p.range));
            case "read_all":
              return json(await readAll(client, p.spreadsheet_token, p.sheet_id));
            default:
              return json({ error: `Unknown action: ${(p as any).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "feishu_sheet" }
  );

  api.logger.info?.("feishu_sheet: Registered feishu_sheet tool");
}

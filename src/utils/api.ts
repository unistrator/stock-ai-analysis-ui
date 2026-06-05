import type { ImportantNode, KLinePoint, StockAnalysisResponse } from "../types";
import { authHeaders, requireToken } from "./auth";
import { createMockAnalysis, mockDelay } from "./mockData";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const ANALYZE_API_URL = import.meta.env.VITE_ANALYZE_API_URL ?? "/trees/analyze";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

interface TreesAnalyzeResponse {
  analysis: string;
  total_analyze: string;
  daily_data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount?: number;
  }>;
  important_point: Record<string, string>;
  meta: {
    stock_code: string;
    time_range?: string;
    tree_name?: string;
    daily_count?: number;
  };
}

const NODE_TYPE_RULES: Array<{ type: string; label: string; keywords: RegExp[] }> = [
  { type: "reversal", label: "反转信号", keywords: [/反转/, /逆转/, /V\s*形/i] },
  { type: "breakout", label: "突破节点", keywords: [/突破/, /向上突破/, /放量突破/] },
  { type: "support", label: "支撑节点", keywords: [/支撑/, /回踩/, /企稳/, /获支撑/] },
  { type: "resistance", label: "阻力节点", keywords: [/阻力/, /压力/, /前高/, /承压/, /阻挡/] },
];

const DEFAULT_NODE_TYPE = { type: "important", label: "重要节点" };

function inferNodeType(description: string): { type: string; label: string } {
  for (const rule of NODE_TYPE_RULES) {
    if (rule.keywords.some((keyword) => keyword.test(description))) {
      return { type: rule.type, label: rule.label };
    }
  }
  return DEFAULT_NODE_TYPE;
}

function toApiDate(date: string): string {
  return date.replace(/-/g, "");
}

function normalizeDate(date: string): string {
  return date.split(" ")[0];
}

function mapTreesResponse(
  data: TreesAnalyzeResponse,
  startDate: string,
  endDate: string,
): StockAnalysisResponse {
  const kline: KLinePoint[] = data.daily_data.map((bar) => ({
    date: normalizeDate(bar.date),
    open: Number(bar.open.toFixed(2)),
    high: Number(bar.high.toFixed(2)),
    low: Number(bar.low.toFixed(2)),
    close: Number(bar.close.toFixed(2)),
    volume: bar.volume,
  }));

  const priceByDate = new Map(kline.map((bar) => [bar.date, bar]));

  const nodes: ImportantNode[] = Object.entries(data.important_point || {})
    .map(([date, description]) => {
      const normalizedDate = normalizeDate(date);
      const bar = priceByDate.get(normalizedDate);
      const { type, label } = inferNodeType(description);

      return {
        date: normalizedDate,
        type,
        label,
        description,
        price: bar?.high,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    stock_code: data.meta.stock_code,
    start_date: toApiDate(startDate),
    end_date: toApiDate(endDate),
    summary: data.total_analyze || "",
    analysis: data.analysis || "",
    kline,
    nodes,
  };
}

function handleAuthError(res: Response): void {
  if (res.status === 401) {
    throw new Error("鉴权失败：Token 无效或已过期");
  }
}

/** 在请求 URL 上附加 token 参数，并保留 Authorization 头（双通道鉴权） */
function withAuthUrl(pathOrUrl: string): string {
  const token = requireToken();
  const base = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : new URL(pathOrUrl, window.location.origin).toString();
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}

async function requestTreesAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<StockAnalysisResponse> {
  const res = await fetch(withAuthUrl(ANALYZE_API_URL), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      code: stockCode,
      start_date: startDate,
      end_date: endDate,
      use_local_build: true,
      overwrite: true,
      temperature: null,
      max_tokens: null,
      extra_prompt: null,
    }),
    signal,
  });

  handleAuthError(res);
  if (!res.ok) {
    let message = `请求失败：HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error) message = err.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const data = (await res.json()) as TreesAnalyzeResponse;
  return mapTreesResponse(data, startDate, endDate);
}

async function requestLegacyAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<StockAnalysisResponse> {
  const url = new URL(`${API_BASE}/api/stock-analysis`);
  url.searchParams.set("stock_code", stockCode);
  url.searchParams.set("start_date", toApiDate(startDate));
  url.searchParams.set("end_date", toApiDate(endDate));
  url.searchParams.set("token", requireToken());

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    signal,
  });

  handleAuthError(res);
  if (!res.ok) {
    throw new Error(`请求失败：HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchStockAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<StockAnalysisResponse> {
  if (USE_MOCK) {
    await mockDelay(600, signal);
    return createMockAnalysis(stockCode, startDate, endDate);
  }

  if (ANALYZE_API_URL) {
    return requestTreesAnalysis(stockCode, startDate, endDate, signal);
  }

  return requestLegacyAnalysis(stockCode, startDate, endDate, signal);
}

export interface StockOption {
  value: string;
  label: string;
  name: string;
}

type StockMappingResponse = Record<string, Record<string, string>>;

const STOCK_MAPPING_URL =
  import.meta.env.VITE_STOCK_MAPPING_URL ?? "/stock_codes/mapping";

function mapResponseToStockOptions(data: StockMappingResponse): StockOption[] {
  const options: StockOption[] = [];
  for (const group of Object.values(data)) {
    for (const [code, name] of Object.entries(group)) {
      if (!code || !name?.trim()) continue;
      options.push({
        value: code,
        name: name.trim(),
        label: `${code} ${name.trim()}`,
      });
    }
  }
  return options;
}

export async function fetchStockMapping(): Promise<StockOption[]> {
  const res = await fetch(withAuthUrl(STOCK_MAPPING_URL), {
    headers: authHeaders(),
  });

  handleAuthError(res);
  if (!res.ok) {
    throw new Error(`股票列表加载失败：HTTP ${res.status}`);
  }
  const data = (await res.json()) as StockMappingResponse;
  return mapResponseToStockOptions(data);
}

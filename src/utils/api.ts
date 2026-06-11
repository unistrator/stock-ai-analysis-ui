import type {
  BriefAnalysisResult,
  DetailAnalysisResult,
  ImportantNode,
  KLinePoint,
} from "../types";
import { authHeaders, requireToken } from "./auth";
import { createMockAnalysis, mockDelay } from "./mockData";
import { readBriefSseStream, readDetailSseStream } from "./sseBriefStream";

const ANALYZE_BRIEF_URL =
  import.meta.env.VITE_ANALYZE_BRIEF_URL ?? "/trees/analyze/brief";
const ANALYZE_DETAIL_URL =
  import.meta.env.VITE_ANALYZE_DETAIL_URL ?? "/trees/analyze/detail";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const MOCK_BRIEF_STREAM = import.meta.env.VITE_MOCK_BRIEF_STREAM === "true";
const MOCK_DETAIL_STREAM = import.meta.env.VITE_MOCK_DETAIL_STREAM === "true";

interface TreesDailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

interface TreesBriefResponse {
  analysis: string;
  total_analyze: string;
  daily_data: TreesDailyBar[];
  important_point: Record<string, string>;
  meta: {
    stock_code: string;
    time_range?: string;
    tree_name?: string;
    daily_count?: number;
  };
}

interface TreesDetailResponse {
  analysis: string;
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

function mapKline(dailyData: TreesDailyBar[]): KLinePoint[] {
  return dailyData.map((bar) => ({
    date: normalizeDate(bar.date),
    open: Number(bar.open.toFixed(2)),
    high: Number(bar.high.toFixed(2)),
    low: Number(bar.low.toFixed(2)),
    close: Number(bar.close.toFixed(2)),
    volume: bar.volume,
  }));
}

function mapImportantNodes(
  importantPoint: Record<string, string>,
  kline: KLinePoint[],
): ImportantNode[] {
  const priceByDate = new Map(kline.map((bar) => [bar.date, bar]));

  return Object.entries(importantPoint || {})
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
}

function mapBriefResponse(
  data: TreesBriefResponse,
  startDate: string,
  endDate: string,
): BriefAnalysisResult {
  const kline = mapKline(data.daily_data);

  return {
    stock_code: data.meta.stock_code,
    start_date: toApiDate(startDate),
    end_date: toApiDate(endDate),
    summary: data.total_analyze || "",
    kline,
    nodes: mapImportantNodes(data.important_point, kline),
  };
}

function mapDetailResponse(data: TreesDetailResponse): DetailAnalysisResult {
  return {
    analysis: data.analysis || "",
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

function buildAnalyzeRequestBody(
  stockCode: string,
  startDate: string,
  endDate: string,
) {
  return JSON.stringify({
    code: stockCode,
    start_date: startDate,
    end_date: endDate,
    use_local_build: true,
    overwrite: true,
    temperature: null,
    max_tokens: null,
    extra_prompt: null,
  });
}

async function parseAnalyzeError(res: Response): Promise<string> {
  let message = `请求失败：HTTP ${res.status}`;
  try {
    const err = await res.json();
    if (err?.error) message = err.error;
  } catch {
    // ignore parse error
  }
  return message;
}

async function requestTreesSection<T>(
  url: string,
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(withAuthUrl(url), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: buildAnalyzeRequestBody(stockCode, startDate, endDate),
    signal,
  });

  handleAuthError(res);
  if (!res.ok) {
    throw new Error(await parseAnalyzeError(res));
  }

  return res.json() as Promise<T>;
}

export interface BriefAnalysisStreamOptions {
  onSummaryChunk?: (summary: string) => void;
}

async function simulateMockBriefStream(
  summary: string,
  response: TreesBriefResponse,
  onSummaryChunk: ((summary: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<TreesBriefResponse> {
  const chunkSize = 28;
  let partial = "";

  for (let offset = 0; offset < summary.length; offset += chunkSize) {
    await mockDelay(40, signal);
    partial += summary.slice(offset, offset + chunkSize);
    onSummaryChunk?.(partial);
  }

  return response;
}

function buildMockBriefResponse(mock: ReturnType<typeof createMockAnalysis>): TreesBriefResponse {
  const importantPoint = Object.fromEntries(
    mock.nodes.map((node) => [node.date, node.description]),
  );

  return {
    total_analyze: `## 简要总结\n\n${mock.summary}`,
    analysis: mock.analysis,
    important_point: importantPoint,
    daily_data: mock.kline.map((bar) => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? 0,
    })),
    meta: {
      stock_code: mock.stock_code,
    },
  };
}

function isCachedJsonResponse(res: Response): boolean {
  const contentType = res.headers.get("Content-Type") ?? "";
  return contentType.includes("application/json");
}

async function requestBriefAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  options?: BriefAnalysisStreamOptions,
  signal?: AbortSignal,
): Promise<TreesBriefResponse> {
  const res = await fetch(withAuthUrl(ANALYZE_BRIEF_URL), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: buildAnalyzeRequestBody(stockCode, startDate, endDate),
    signal,
  });

  handleAuthError(res);
  if (!res.ok) {
    throw new Error(await parseAnalyzeError(res));
  }

  // 命中缓存：一次性返回完整 JSON；未命中：SSE 流式生成 AI 分析
  if (isCachedJsonResponse(res)) {
    return res.json() as Promise<TreesBriefResponse>;
  }

  const meta = await readBriefSseStream(res, options, signal);
  return {
    analysis: meta.analysis || "",
    total_analyze: meta.total_analyze || "",
    daily_data: meta.daily_data as TreesDailyBar[],
    important_point: meta.important_point || {},
    meta: meta.meta as TreesBriefResponse["meta"],
  };
}

export async function fetchBriefAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  options?: BriefAnalysisStreamOptions,
): Promise<BriefAnalysisResult> {
  if (USE_MOCK) {
    await mockDelay(MOCK_BRIEF_STREAM ? 200 : 600, signal);
    const mock = createMockAnalysis(stockCode, startDate, endDate);

    if (MOCK_BRIEF_STREAM) {
      const response = buildMockBriefResponse(mock);
      const data = await simulateMockBriefStream(
        response.total_analyze,
        response,
        options?.onSummaryChunk,
        signal,
      );
      return mapBriefResponse(data, startDate, endDate);
    }

    return mapBriefResponse(buildMockBriefResponse(mock), startDate, endDate);
  }

  const data = await requestBriefAnalysis(
    stockCode,
    startDate,
    endDate,
    options,
    signal,
  );
  return mapBriefResponse(data, startDate, endDate);
}

export interface DetailAnalysisStreamOptions {
  onAnalysisChunk?: (analysis: string) => void;
}

async function simulateMockDetailStream(
  analysis: string,
  onAnalysisChunk: ((analysis: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const chunkSize = 32;
  let partial = "";

  for (let offset = 0; offset < analysis.length; offset += chunkSize) {
    await mockDelay(40, signal);
    partial += analysis.slice(offset, offset + chunkSize);
    onAnalysisChunk?.(partial);
  }
}

async function requestDetailAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  options?: DetailAnalysisStreamOptions,
  signal?: AbortSignal,
): Promise<TreesDetailResponse> {
  const res = await fetch(withAuthUrl(ANALYZE_DETAIL_URL), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: buildAnalyzeRequestBody(stockCode, startDate, endDate),
    signal,
  });

  handleAuthError(res);
  if (!res.ok) {
    throw new Error(await parseAnalyzeError(res));
  }

  // 命中缓存：一次性返回完整 JSON；未命中：SSE 流式生成 AI 分析
  if (isCachedJsonResponse(res)) {
    return res.json() as Promise<TreesDetailResponse>;
  }

  const result = await readDetailSseStream(
    res,
    { onAnalysisChunk: options?.onAnalysisChunk },
    signal,
  );
  return {
    analysis: result.analysis || "",
    meta: result.meta as TreesDetailResponse["meta"],
  };
}

export async function fetchDetailAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  options?: DetailAnalysisStreamOptions,
): Promise<DetailAnalysisResult> {
  if (USE_MOCK) {
    await mockDelay(MOCK_DETAIL_STREAM ? 300 : 900, signal);
    const mock = createMockAnalysis(stockCode, startDate, endDate);

    if (MOCK_DETAIL_STREAM) {
      await simulateMockDetailStream(mock.analysis, options?.onAnalysisChunk, signal);
      return { analysis: mock.analysis };
    }

    return { analysis: mock.analysis };
  }

  const data = await requestDetailAnalysis(
    stockCode,
    startDate,
    endDate,
    options,
    signal,
  );
  return mapDetailResponse(data);
}

export interface StockOption {
  value: string;
  label: string;
  name: string;
  pinyinFull: string;
  pinyinAbbr: string;
}

interface StockMappingResponse {
  code_name: Record<string, Record<string, string>>;
  name_pinyin: Record<string, string>;
}

const STOCK_MAPPING_URL =
  import.meta.env.VITE_STOCK_MAPPING_URL ?? "/stock_codes/mapping";

function parseNamePinyin(raw: string): { full: string; abbr: string } {
  const [full = "", abbr = ""] = raw.trim().split(/\s+/);
  return { full, abbr };
}

function mapResponseToStockOptions(data: StockMappingResponse): StockOption[] {
  const options: StockOption[] = [];
  for (const group of Object.values(data.code_name ?? {})) {
    for (const [code, name] of Object.entries(group)) {
      if (!code || !name?.trim()) continue;
      const trimmedName = name.trim();
      const { full, abbr } = parseNamePinyin(data.name_pinyin?.[trimmedName] ?? "");
      options.push({
        value: code,
        name: trimmedName,
        label: `${code} ${trimmedName}`,
        pinyinFull: full,
        pinyinAbbr: abbr,
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

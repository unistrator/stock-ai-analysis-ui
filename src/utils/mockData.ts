import type { StockAnalysisResponse, KLinePoint, ImportantNode } from "../types";

const STOCK_NAMES: Record<string, string> = {
  "000001.SZ": "平安银行",
  "600519.SH": "贵州茅台",
  "000858.SZ": "五粮液",
  "601318.SH": "中国平安",
  "300750.SZ": "宁德时代",
  "002594.SZ": "比亚迪",
  "600036.SH": "招商银行",
  "000333.SZ": "美的集团",
};

function toYMD(date: string): string {
  return date.replace(/-/g, "");
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(dateStr: string): Date {
  const normalized = dateStr.includes("-") ? dateStr : dateStr.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  return new Date(normalized);
}

function generateKLine(startDate: string, endDate: string): KLinePoint[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const points: KLinePoint[] = [];
  let price = 80 + Math.random() * 40;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const change = (Math.random() - 0.48) * 4;
      const open = price;
      const close = Math.max(1, open + change);
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      points.push({
        date: formatDate(cursor),
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(Math.max(0.01, low).toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Math.round(500000 + Math.random() * 2000000),
      });
      price = close;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

function pickNodes(kline: KLinePoint[]): ImportantNode[] {
  if (kline.length < 5) return [];

  const indices = [
    Math.floor(kline.length * 0.15),
    Math.floor(kline.length * 0.4),
    Math.floor(kline.length * 0.65),
    Math.floor(kline.length * 0.85),
  ];

  const nodeTypes = [
    { type: "breakout", label: "突破节点", desc: "价格放量突破前期整理区间上沿，短期动能转强。" },
    { type: "support", label: "支撑节点", desc: "回踩关键均线获得支撑，缩量企稳，下跌动能减弱。" },
    { type: "resistance", label: "阻力节点", desc: "接近前高压力位，上影线增多，需观察能否有效突破。" },
    { type: "reversal", label: "反转信号", desc: "出现典型反转 K 线组合，趋势有由弱转强迹象。" },
  ];

  return indices.map((idx, i) => {
    const bar = kline[idx];
    return {
      date: bar.date,
      type: nodeTypes[i].type,
      label: nodeTypes[i].label,
      description: nodeTypes[i].desc,
      price: bar.high,
    };
  });
}

function buildSummary(stockCode: string, kline: KLinePoint[]): string {
  const name = STOCK_NAMES[stockCode] || stockCode;
  const first = kline[0]?.close ?? 0;
  const last = kline[kline.length - 1]?.close ?? 0;
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const direction = changePct >= 0 ? "上涨" : "下跌";

  return `${name} 在选定区间内整体呈${direction}态势，区间涨跌幅 ${changePct.toFixed(2)}%。`
    + ` 价格沿关键均线运行，${changePct >= 0 ? "多头" : "空头"}结构相对清晰，`
    + ` 需重点关注突破/回踩时的量价配合与重要技术节点。`;
}

function buildAnalysis(stockCode: string, kline: KLinePoint[], nodes: ImportantNode[]): string {
  const name = STOCK_NAMES[stockCode] || stockCode;
  const highs = kline.map((k) => k.high);
  const lows = kline.map((k) => k.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);

  const nodeLines = nodes
    .map((n, i) => `${i + 1}. ${n.date} · ${n.label}：${n.description}`)
    .join("\n");

  return `## ${name}（${stockCode}）完整 AI 分析\n\n`
    + `### 趋势概览\n`
    + `区间内最高价 ${maxHigh.toFixed(2)}，最低价 ${minLow.toFixed(2)}，振幅 ${(((maxHigh - minLow) / minLow) * 100).toFixed(2)}%。`
    + ` 从结构上看，价格在中枢附近反复震荡后选择方向，成交量在关键节点附近有所放大。\n\n`
    + `### 重要节点解读\n${nodeLines}\n\n`
    + `### 风险提示\n`
    + `以上分析基于历史 K 线数据与模式识别，不构成投资建议。`
    + ` 请结合基本面、宏观环境及自身风险承受能力独立决策。`;
}

export function createMockAnalysis(
  stockCode: string,
  startDate: string,
  endDate: string,
): StockAnalysisResponse {
  const kline = generateKLine(startDate, endDate);
  const nodes = pickNodes(kline);

  return {
    stock_code: stockCode,
    stock_name: STOCK_NAMES[stockCode],
    start_date: toYMD(startDate),
    end_date: toYMD(endDate),
    summary: buildSummary(stockCode, kline),
    analysis: buildAnalysis(stockCode, kline, nodes),
    kline,
    nodes,
  };
}

export async function mockDelay(ms = 600): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const HISTORY_KEY = "stock_query_history";
const MAX_HISTORY = 5;

export interface StockQueryHistoryItem {
  stockCode: string;
  stockName?: string;
  queriedAt: number;
}

function isValidItem(item: unknown): item is StockQueryHistoryItem {
  if (typeof item !== "object" || item === null) return false;
  const record = item as StockQueryHistoryItem;
  return typeof record.stockCode === "string" && typeof record.queriedAt === "number";
}

export function loadStockQueryHistory(): StockQueryHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function appendStockQueryHistory(
  stockCode: string,
  stockName?: string,
): StockQueryHistoryItem[] {
  const normalized = stockCode.trim().toUpperCase();
  if (!normalized) return loadStockQueryHistory();

  const next: StockQueryHistoryItem[] = [
    { stockCode: normalized, stockName, queriedAt: Date.now() },
    ...loadStockQueryHistory().filter((item) => item.stockCode !== normalized),
  ].slice(0, MAX_HISTORY);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

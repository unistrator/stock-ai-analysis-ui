export interface KLinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ImportantNode {
  date: string;
  type: string;
  label: string;
  description: string;
  price?: number;
}

export interface StockAnalysisResponse {
  stock_code: string;
  stock_name?: string;
  start_date: string;
  end_date: string;
  summary: string;
  analysis: string;
  kline: KLinePoint[];
  nodes: ImportantNode[];
}

export interface BriefAnalysisResult {
  stock_code: string;
  start_date: string;
  end_date: string;
  summary: string;
  kline: KLinePoint[];
  nodes: ImportantNode[];
}

export interface DetailAnalysisResult {
  analysis: string;
}

export interface StockOption {
  value: string;
  label: string;
}

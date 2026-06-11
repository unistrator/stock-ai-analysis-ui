export interface SseParseResult {
  events: unknown[];
  rest: string;
}

/** 从 SSE 缓冲区解析完整 event 块，保留未收齐的尾部。 */
export function parseSseBuffer(buffer: string): SseParseResult {
  const events: unknown[] = [];
  let rest = buffer;

  while (true) {
    const separatorIndex = rest.indexOf("\n\n");
    if (separatorIndex === -1) break;

    const block = rest.slice(0, separatorIndex);
    rest = rest.slice(separatorIndex + 2);

    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) continue;

    const payload = dataLines.join("\n");
    if (!payload) continue;

    try {
      events.push(JSON.parse(payload));
    } catch {
      rest = `${block}\n\n${rest}`;
      break;
    }
  }

  return { events, rest };
}

export interface AnalysisSseEvent {
  type?: string;
  field?: string;
  text?: string;
  daily_data?: unknown;
  meta?: unknown;
  analysis?: string;
  total_analyze?: string;
  important_point?: Record<string, string>;
}

export interface AnalysisSseStreamOptions {
  /** 需要累积的 markdown 字段名（如 total_analyze / analysis） */
  field: string;
  /** 流式增量回调，返回到目前为止累积的完整文本 */
  onChunk?: (accumulated: string) => void;
  /** 是否要求 meta 事件携带 daily_data 才视为完整数据 */
  requireDailyData?: boolean;
}

/** 通用 SSE 读取：累积指定 markdown 字段，并返回最终 meta 事件。 */
export async function readAnalysisSseStream(
  res: Response,
  options: AnalysisSseStreamOptions,
  signal?: AbortSignal,
): Promise<AnalysisSseEvent> {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("流式响应不可用");
  }

  const decoder = new TextDecoder();
  let sseBuffer = "";
  let accumulated = "";
  let finalData: AnalysisSseEvent | null = null;

  const handleEvent = (event: AnalysisSseEvent) => {
    if (event.type === "markdown_delta" && typeof event.text === "string") {
      if (event.field && event.field !== options.field) return;
      accumulated += event.text;
      options.onChunk?.(accumulated);
      return;
    }

    if (event.type === "meta") {
      if (options.requireDailyData && !Array.isArray(event.daily_data)) return;
      finalData = event;
    }
  };

  const consumeParsedEvents = () => {
    const { events, rest } = parseSseBuffer(sseBuffer);
    sseBuffer = rest;
    for (const event of events) {
      handleEvent(event as AnalysisSseEvent);
    }
  };

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }

    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    consumeParsedEvents();
  }

  sseBuffer += decoder.decode();
  consumeParsedEvents();

  if (sseBuffer.trim()) {
    consumeParsedEvents();
  }

  if (finalData) {
    return finalData;
  }

  if (options.requireDailyData) {
    throw new Error("流式响应未返回完整分析数据");
  }

  // 无 meta 事件时（如完整分析），用累积文本兜底返回
  return { type: "meta", [options.field]: accumulated } as AnalysisSseEvent;
}

export interface BriefSseStreamHandlers {
  onSummaryChunk?: (summary: string) => void;
}

export function readBriefSseStream(
  res: Response,
  handlers?: BriefSseStreamHandlers,
  signal?: AbortSignal,
): Promise<AnalysisSseEvent> {
  return readAnalysisSseStream(
    res,
    {
      field: "total_analyze",
      onChunk: handlers?.onSummaryChunk,
      requireDailyData: true,
    },
    signal,
  );
}

export interface DetailSseStreamHandlers {
  onAnalysisChunk?: (analysis: string) => void;
}

export async function readDetailSseStream(
  res: Response,
  handlers?: DetailSseStreamHandlers,
  signal?: AbortSignal,
): Promise<{ analysis: string; meta?: unknown }> {
  let accumulated = "";

  const finalData = await readAnalysisSseStream(
    res,
    {
      field: "analysis",
      onChunk: (text) => {
        accumulated = text;
        handlers?.onAnalysisChunk?.(text);
      },
      requireDailyData: false,
    },
    signal,
  );

  return {
    analysis: finalData.analysis || accumulated,
    meta: finalData.meta,
  };
}

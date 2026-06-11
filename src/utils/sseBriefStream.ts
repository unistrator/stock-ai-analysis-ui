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

interface BriefSseEvent {
  type?: string;
  field?: string;
  text?: string;
  daily_data?: unknown;
  meta?: unknown;
  analysis?: string;
  total_analyze?: string;
  important_point?: Record<string, string>;
}

export interface BriefSseStreamHandlers {
  onSummaryChunk?: (summary: string) => void;
}

export async function readBriefSseStream(
  res: Response,
  handlers?: BriefSseStreamHandlers,
  signal?: AbortSignal,
): Promise<BriefSseEvent> {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("流式响应不可用");
  }

  const decoder = new TextDecoder();
  let sseBuffer = "";
  let summaryMarkdown = "";
  let finalData: BriefSseEvent | null = null;

  const handleEvent = (event: BriefSseEvent) => {
    if (event.type === "markdown_delta" && typeof event.text === "string") {
      if (event.field && event.field !== "total_analyze") return;
      summaryMarkdown += event.text;
      handlers?.onSummaryChunk?.(summaryMarkdown);
      return;
    }

    if (event.type === "meta" && Array.isArray(event.daily_data)) {
      finalData = event;
    }
  };

  const consumeParsedEvents = () => {
    const { events, rest } = parseSseBuffer(sseBuffer);
    sseBuffer = rest;
    for (const event of events) {
      handleEvent(event as BriefSseEvent);
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

  if (!finalData) {
    throw new Error("流式响应未返回完整分析数据");
  }

  return finalData;
}

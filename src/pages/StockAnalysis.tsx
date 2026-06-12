import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Collapse,
  Col,
  DatePicker,
  Empty,
  message,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { LineChartOutlined, RobotOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import KLineChart, { getNodeKey } from "../components/KLineChart";
import MarkdownContent from "../components/MarkdownContent";
import {
  fetchBriefAnalysis,
  fetchDetailAnalysis,
  fetchStockMapping,
  type StockOption,
} from "../utils/api";
import useIsMobile from "../hooks/useIsMobile";
import { useTypewriterText } from "../hooks/useTypewriterText";
import type { BriefAnalysisResult, DetailAnalysisResult } from "../types";
import {
  appendStockQueryHistory,
  loadStockQueryHistory,
  type StockQueryHistoryItem,
} from "../utils/queryHistory";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const NODE_TAG_COLORS: Record<string, string> = {
  breakout: "blue",
  support: "green",
  resistance: "gold",
  reversal: "magenta",
  important: "purple",
};

const MAX_SUGGESTIONS = 50;

const DEFAULT_STOCK_CODE = "00700.HK";

function getDefaultDateRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(6, "month"), dayjs()];
}

const SUMMARY_HEADER_TAG_STYLE = {
  fontSize: 14,
  lineHeight: "22px",
  padding: "2px 10px",
};

function normalizeStockCode(code: string): string {
  return code.trim().toUpperCase();
}

interface ActiveQuery {
  code: string;
  startDate: string;
  endDate: string;
  controller: AbortController;
}

interface DetailQuery {
  controller: AbortController;
}

function getDefaultQueryParams(): { code: string; startDate: string; endDate: string } {
  const [start, end] = getDefaultDateRange();
  return {
    code: DEFAULT_STOCK_CODE,
    startDate: start.format("YYYY-MM-DD"),
    endDate: end.format("YYYY-MM-DD"),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function searchStockOptions(
  options: StockOption[],
  input: string,
): { value: string; label: string }[] {
  const query = input.trim();
  if (!query) return [];

  const queryUpper = query.toUpperCase();
  const queryLower = query.toLowerCase();

  const results: { value: string; label: string }[] = [];
  for (const opt of options) {
    if (
      opt.value.toUpperCase().includes(queryUpper) ||
      opt.name.includes(query) ||
      opt.pinyinFull.includes(queryLower) ||
      opt.pinyinAbbr.includes(queryLower)
    ) {
      results.push({ value: opt.value, label: opt.label });
      if (results.length >= MAX_SUGGESTIONS) break;
    }
  }
  return results;
}

function formatHistoryLabel(
  item: StockQueryHistoryItem,
  stockOptionByCode: Map<string, StockOption>,
): string {
  const name = item.stockName ?? stockOptionByCode.get(item.stockCode)?.name;
  return name ? `${item.stockCode} ${name}` : item.stockCode;
}

export default function StockAnalysisPage() {
  const isMobile = useIsMobile();
  const [stockCode, setStockCode] = useState(DEFAULT_STOCK_CODE);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(getDefaultDateRange);
  const [briefLoading, setBriefLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [briefResult, setBriefResult] = useState<BriefAnalysisResult | null>(null);
  const [streamingSummary, setStreamingSummary] = useState("");
  const [detailResult, setDetailResult] = useState<DetailAnalysisResult | null>(null);
  const [streamingDetail, setStreamingDetail] = useState("");
  const [hasQueried, setHasQueried] = useState(true);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingError, setMappingError] = useState("");
  const [queryHistory, setQueryHistory] = useState(() => loadStockQueryHistory());
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [highlightedNodeKey, setHighlightedNodeKey] = useState<string | null>(null);
  const [typewriterResetKey, setTypewriterResetKey] = useState(0);
  const [summaryIsStreaming, setSummaryIsStreaming] = useState(false);
  const [detailTypewriterResetKey, setDetailTypewriterResetKey] = useState(0);
  const [detailIsStreaming, setDetailIsStreaming] = useState(false);
  const activeQueryRef = useRef<ActiveQuery | null>(null);
  const detailQueryRef = useRef<DetailQuery | null>(null);
  const detailPrefetchRef = useRef<DetailQuery | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchStockMapping()
      .then((options) => {
        if (!cancelled) setStockOptions(options);
      })
      .catch((e) => {
        if (!cancelled) {
          setMappingError(e instanceof Error ? e.message : "股票列表加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setMappingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stockOptionByCode = useMemo(
    () => new Map(stockOptions.map((opt) => [opt.value, opt])),
    [stockOptions],
  );

  const autocompleteOptions = useMemo(
    () => searchStockOptions(stockOptions, stockCode),
    [stockOptions, stockCode],
  );

  const briefStockLabel = useMemo(() => {
    if (!briefResult) return "";
    const matched = stockOptionByCode.get(briefResult.stock_code);
    return matched ? `${briefResult.stock_code} ${matched.name}` : briefResult.stock_code;
  }, [briefResult, stockOptionByCode]);

  const summaryTarget = briefResult?.summary ?? streamingSummary;
  const summaryContent = useTypewriterText(summaryTarget, typewriterResetKey, summaryIsStreaming);
  const showSummaryContent = Boolean(summaryContent.trim());

  const detailTarget = detailResult?.analysis ?? streamingDetail;
  const detailContent = useTypewriterText(
    detailTarget,
    detailTypewriterResetKey,
    detailIsStreaming,
  );
  const showDetailPanel = detailLoading || Boolean(detailContent.trim());

  const queryInfoTags = briefResult ? (
    <>
      <Tag color="geekblue" style={SUMMARY_HEADER_TAG_STYLE}>
        {briefStockLabel}
      </Tag>
      <Tag color="orange" style={SUMMARY_HEADER_TAG_STYLE}>
        {briefResult.start_date} ~ {briefResult.end_date}
      </Tag>
    </>
  ) : null;

  const handleQuery = async (override?: { code?: string; range?: [Dayjs, Dayjs] }) => {
    const rawCode = override?.code ?? stockCode;
    if (!rawCode.trim()) {
      message.warning("请输入股票代码");
      return;
    }

    const code = normalizeStockCode(rawCode);
    const range = override?.range ?? dateRange;
    if (!range[0] || !range[1]) {
      message.warning("请选择完整的日期范围");
      return;
    }

    const startDate = range[0].format("YYYY-MM-DD");
    const endDate = range[1].format("YYYY-MM-DD");
    const active = activeQueryRef.current;

    if (
      active &&
      !active.controller.signal.aborted &&
      active.code === code &&
      active.startDate === startDate &&
      active.endDate === endDate
    ) {
      return;
    }

    active?.controller.abort();
    detailQueryRef.current?.controller.abort();
    detailQueryRef.current = null;

    const controller = new AbortController();
    activeQueryRef.current = { code, startDate, endDate, controller };

    setHasQueried(true);
    setTypewriterResetKey((key) => key + 1);
    setDetailExpanded(false);
    setBriefLoading(true);
    setBriefError("");
    setDetailError("");
    setBriefResult(null);
    setStreamingSummary("");
    setSummaryIsStreaming(false);
    setDetailResult(null);
    setStreamingDetail("");
    setDetailIsStreaming(false);
    setDetailTypewriterResetKey((key) => key + 1);
    setDetailLoading(false);
    setHighlightedNodeKey(null);

    const isActive = () => activeQueryRef.current?.controller === controller;

    try {
      const data = await fetchBriefAnalysis(
        code,
        startDate,
        endDate,
        controller.signal,
        {
          onSummaryChunk: (summary) => {
            if (!isActive()) return;
            setSummaryIsStreaming(true);
            setStreamingSummary(summary);
          },
        },
      );
      if (!isActive()) return;
      setBriefResult(data);
      setStreamingSummary("");
      setBriefError("");
      setQueryHistory(
        appendStockQueryHistory(code, {
          stockName: stockOptionByCode.get(code)?.name,
          startDate,
          endDate,
        }),
      );
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      if (!isActive()) return;
      setBriefResult(null);
      setStreamingSummary("");
      setSummaryIsStreaming(false);
      setBriefError(e instanceof Error ? e.message : "简要分析加载失败");
    } finally {
      if (isActive()) {
        setBriefLoading(false);
        activeQueryRef.current = null;
      }
    }
  };

  const handleHistoryClick = (item: StockQueryHistoryItem) => {
    setStockCode(item.stockCode);
    const range: [Dayjs, Dayjs] =
      item.startDate && item.endDate
        ? [dayjs(item.startDate), dayjs(item.endDate)]
        : getDefaultDateRange();
    setDateRange(range);
    void handleQuery({ code: item.stockCode, range });
  };

  const handleGenerateDetail = async () => {
    if (!stockCode.trim()) {
      message.warning("请输入股票代码");
      return;
    }
    if (!dateRange[0] || !dateRange[1]) {
      message.warning("请选择完整的日期范围");
      return;
    }

    const code = normalizeStockCode(stockCode);
    const startDate = dateRange[0].format("YYYY-MM-DD");
    const endDate = dateRange[1].format("YYYY-MM-DD");

    detailQueryRef.current?.controller.abort();

    const controller = new AbortController();
    detailQueryRef.current = { controller };

    setDetailLoading(true);
    setDetailError("");
    setDetailResult(null);
    setStreamingDetail("");
    setDetailIsStreaming(true);
    setDetailTypewriterResetKey((key) => key + 1);
    setDetailExpanded(true);

    const isActive = () => detailQueryRef.current?.controller === controller;

    try {
      const data = await fetchDetailAnalysis(
        code,
        startDate,
        endDate,
        controller.signal,
        {
          onAnalysisChunk: (analysis) => {
            if (!isActive()) return;
            setStreamingDetail(analysis);
          },
        },
      );
      if (!isActive()) return;
      setDetailResult(data);
      setStreamingDetail("");
      setDetailExpanded(true);
      setDetailError("");
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      if (!isActive()) return;
      setDetailResult(null);
      setStreamingDetail("");
      setDetailIsStreaming(false);
      setDetailError(e instanceof Error ? e.message : "完整分析加载失败");
    } finally {
      if (isActive()) {
        setDetailLoading(false);
        detailQueryRef.current = null;
      }
    }
  };

  const handleQueryRef = useRef(handleQuery);
  handleQueryRef.current = handleQuery;

  useEffect(() => {
    void handleQueryRef.current();

    const { code, startDate, endDate } = getDefaultQueryParams();
    const prefetchController = new AbortController();
    detailPrefetchRef.current = { controller: prefetchController };

    void fetchDetailAnalysis(code, startDate, endDate, prefetchController.signal)
      .catch((e) => {
        if (isAbortError(e) || prefetchController.signal.aborted) return;
      })
      .finally(() => {
        if (detailPrefetchRef.current?.controller === prefetchController) {
          detailPrefetchRef.current = null;
        }
      });

    return () => {
      activeQueryRef.current?.controller.abort();
      activeQueryRef.current = null;
      detailQueryRef.current?.controller.abort();
      detailQueryRef.current = null;
      detailPrefetchRef.current?.controller.abort();
      detailPrefetchRef.current = null;
    };
  }, []);

  return (
    <div>
      <Card
        title={
          <Space>
            <LineChartOutlined />
            <span>查询条件</span>
          </Space>
        }
        size={isMobile ? "small" : "default"}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <div style={{ marginBottom: 6, color: "rgba(255,255,255,0.65)", fontSize: 13 }}>股票代码</div>
            <AutoComplete
              value={stockCode}
              options={autocompleteOptions}
              onChange={setStockCode}
              onSelect={(value) => setStockCode(String(value))}
              style={{ width: "100%" }}
              placeholder={
                mappingLoading
                  ? "正在加载股票列表..."
                  : "输入代码、名称或拼音首字母，如 000001.SZ、茅台、gzmt"
              }
              allowClear
            />
          </Col>
          <Col xs={24} md={10}>
            <div style={{ marginBottom: 6, color: "rgba(255,255,255,0.65)", fontSize: 13 }}>日期范围</div>
            <RangePicker
              value={dateRange}
              onChange={(values) => {
                if (values?.[0] && values[1]) {
                  setDateRange([values[0], values[1]]);
                }
              }}
              style={{ width: "100%" }}
              allowClear={false}
            />
          </Col>
          <Col xs={24} md={6}>
            <div style={{ marginBottom: 6, opacity: 0, fontSize: 13 }}>.</div>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => void handleQuery()}
              block={isMobile}
              style={isMobile ? undefined : { minWidth: 120 }}
            >
              查询
            </Button>
          </Col>
        </Row>
        {queryHistory.length > 0 && (
          <div className="query-history">
            <Text type="secondary" className="query-history__label">
              最近查询
            </Text>
            <div className="query-history__tags">
              {queryHistory.map((item) => (
                <Tag
                  key={item.stockCode}
                  style={{ cursor: "pointer", marginInlineEnd: 0, flexShrink: 0 }}
                  onClick={() => handleHistoryClick(item)}
                >
                  {formatHistoryLabel(item, stockOptionByCode)}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Card>

      {mappingError && (
        <Alert
          type="warning"
          message={mappingError}
          description="仍可手动输入股票代码进行查询"
          showIcon
          style={{ marginTop: 12 }}
        />
      )}

      {hasQueried && (
        <>
          <Card
            title={
              <Space wrap>
                <span>K 线图</span>
                {queryInfoTags}
              </Space>
            }
            size={isMobile ? "small" : "default"}
            style={{ marginTop: 12 }}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                悬停重要节点查看详情
              </Text>
            }
          >
            {briefLoading && (
              <div style={{ padding: "48px 0", textAlign: "center" }}>
                <Spin tip="正在加载 K 线数据..." />
              </div>
            )}
            {!briefLoading && briefError && (
              <Alert type="error" message={briefError} showIcon />
            )}
            {!briefLoading && !briefError && briefResult && (
              <>
                <KLineChart
                  kline={briefResult.kline}
                  nodes={briefResult.nodes}
                  stockName={stockOptionByCode.get(briefResult.stock_code)?.name}
                  highlightedNodeKey={highlightedNodeKey}
                />
                {briefResult.nodes.length > 0 && (
                  <Space wrap style={{ marginTop: 8 }}>
                    {briefResult.nodes.map((node) => (
                      <Tag
                        key={getNodeKey(node)}
                        color={NODE_TAG_COLORS[node.type] ?? "purple"}
                        style={{ cursor: "default" }}
                        onMouseEnter={() => setHighlightedNodeKey(getNodeKey(node))}
                        onMouseLeave={() => setHighlightedNodeKey(null)}
                      >
                        {node.date} {node.label}
                      </Tag>
                    ))}
                  </Space>
                )}
              </>
            )}
          </Card>

          <Card
            style={{ marginTop: 12 }}
            size={isMobile ? "small" : "default"}
            title={
              <Space wrap>
                <RobotOutlined style={{ color: "#1677ff" }} />
                <span>AI 摘要</span>
                {queryInfoTags}
              </Space>
            }
          >
            {briefLoading && !showSummaryContent && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <Spin tip="正在生成简要分析..." />
              </div>
            )}
            {!briefLoading && briefError && (
              <Alert type="error" message={briefError} showIcon />
            )}
            {showSummaryContent && !briefError && (
              <MarkdownContent content={summaryContent} compact />
            )}
          </Card>

          {showDetailPanel ? (
            <Collapse
              style={{ marginTop: 12 }}
              size={isMobile ? "small" : "middle"}
              activeKey={detailExpanded ? ["detail"] : []}
              onChange={(keys) => setDetailExpanded(keys.includes("detail"))}
              items={[
                {
                  key: "detail",
                  label: (
                    <Space wrap>
                      <RobotOutlined style={{ color: "#1677ff" }} />
                      <span>完整 AI 分析</span>
                      {queryInfoTags}
                    </Space>
                  ),
                  children: (
                    <>
                      {detailError && (
                        <Alert type="error" message={detailError} showIcon style={{ marginBottom: 16 }} />
                      )}
                      {detailContent.trim() && <MarkdownContent content={detailContent} />}
                    </>
                  ),
                },
              ]}
            />
          ) : (
            <Card
              style={{ marginTop: 12 }}
              size={isMobile ? "small" : "default"}
              title={
                <Space wrap>
                  <RobotOutlined style={{ color: "#1677ff" }} />
                  <span>完整 AI 分析</span>
                  {queryInfoTags}
                </Space>
              }
            >
              {detailError && (
                <Alert type="error" message={detailError} showIcon style={{ marginBottom: 16 }} />
              )}
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <Button
                  type="primary"
                  icon={<RobotOutlined />}
                  onClick={handleGenerateDetail}
                >
                  生成完整 AI 分析
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {!hasQueried && (
        <Card style={{ marginTop: 12 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="输入股票代码与日期范围，点击查询开始分析"
          />
        </Card>
      )}
    </div>
  );
}

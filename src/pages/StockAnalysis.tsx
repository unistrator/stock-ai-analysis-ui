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
import KLineChart from "../components/KLineChart";
import MarkdownContent from "../components/MarkdownContent";
import {
  fetchBriefAnalysis,
  fetchDetailAnalysis,
  fetchStockMapping,
  type StockOption,
} from "../utils/api";
import useIsMobile from "../hooks/useIsMobile";
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
  const [stockCode, setStockCode] = useState("000001.SZ");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(365, "day"),
    dayjs(),
  ]);
  const [briefLoading, setBriefLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [briefResult, setBriefResult] = useState<BriefAnalysisResult | null>(null);
  const [detailResult, setDetailResult] = useState<DetailAnalysisResult | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingError, setMappingError] = useState("");
  const [queryHistory, setQueryHistory] = useState(() => loadStockQueryHistory());
  const [detailExpanded, setDetailExpanded] = useState(true);
  const activeQueryRef = useRef<ActiveQuery | null>(null);
  const detailQueryRef = useRef<DetailQuery | null>(null);

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

  useEffect(() => {
    return () => {
      activeQueryRef.current?.controller.abort();
      detailQueryRef.current?.controller.abort();
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

  const handleQuery = async () => {
    if (!stockCode.trim()) {
      message.warning("请输入股票代码");
      return;
    }

    const code = normalizeStockCode(stockCode);
    if (!dateRange[0] || !dateRange[1]) {
      message.warning("请选择完整的日期范围");
      return;
    }

    const startDate = dateRange[0].format("YYYY-MM-DD");
    const endDate = dateRange[1].format("YYYY-MM-DD");
    const active = activeQueryRef.current;

    if (
      active &&
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
    setDetailExpanded(false);
    setBriefLoading(true);
    setBriefError("");
    setDetailError("");
    setBriefResult(null);
    setDetailResult(null);

    const isActive = () => activeQueryRef.current?.controller === controller;

    try {
      const data = await fetchBriefAnalysis(code, startDate, endDate, controller.signal);
      if (!isActive()) return;
      setBriefResult(data);
      setBriefError("");
      setQueryHistory(
        appendStockQueryHistory(code, stockOptionByCode.get(code)?.name),
      );
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      if (!isActive()) return;
      setBriefResult(null);
      setBriefError(e instanceof Error ? e.message : "简要分析加载失败");
    } finally {
      if (isActive()) {
        setBriefLoading(false);
        activeQueryRef.current = null;
      }
    }
  };

  const handleGenerateDetail = async () => {
    if (!briefResult) {
      message.warning("请先完成查询");
      return;
    }
    if (!dateRange[0] || !dateRange[1]) {
      message.warning("请选择完整的日期范围");
      return;
    }

    const code = normalizeStockCode(briefResult.stock_code);
    const startDate = dateRange[0].format("YYYY-MM-DD");
    const endDate = dateRange[1].format("YYYY-MM-DD");

    detailQueryRef.current?.controller.abort();

    const controller = new AbortController();
    detailQueryRef.current = { controller };

    setDetailLoading(true);
    setDetailError("");
    setDetailResult(null);

    const isActive = () => detailQueryRef.current?.controller === controller;

    try {
      const data = await fetchDetailAnalysis(code, startDate, endDate, controller.signal);
      if (!isActive()) return;
      setDetailResult(data);
      setDetailExpanded(true);
      setDetailError("");
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      if (!isActive()) return;
      setDetailResult(null);
      setDetailError(e instanceof Error ? e.message : "完整分析加载失败");
    } finally {
      if (isActive()) {
        setDetailLoading(false);
        detailQueryRef.current = null;
      }
    }
  };

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
              onClick={handleQuery}
              block={isMobile}
              style={isMobile ? undefined : { minWidth: 120 }}
            >
              查询
            </Button>
          </Col>
        </Row>
        {queryHistory.length > 0 && (
          <Row gutter={[12, 12]} style={{ marginTop: 20 }}>
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                最近查询
              </Text>
              <Space wrap size={[4, 4]}>
                {queryHistory.map((item) => (
                  <Tag
                    key={item.stockCode}
                    style={{ cursor: "pointer", marginInlineEnd: 0 }}
                    onClick={() => setStockCode(item.stockCode)}
                  >
                    {formatHistoryLabel(item, stockOptionByCode)}
                  </Tag>
                ))}
              </Space>
            </Col>
          </Row>
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
                />
                {briefResult.nodes.length > 0 && (
                  <Space wrap style={{ marginTop: 8 }}>
                    {briefResult.nodes.map((node) => (
                      <Tag
                        key={`${node.date}-${node.type}`}
                        color={NODE_TAG_COLORS[node.type] ?? "purple"}
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
            {briefLoading && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <Spin tip="正在生成简要分析..." />
              </div>
            )}
            {!briefLoading && briefError && (
              <Alert type="error" message={briefError} showIcon />
            )}
            {!briefLoading && !briefError && briefResult && (
              <MarkdownContent content={briefResult.summary} compact />
            )}
          </Card>

          {detailResult ? (
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
                  children: <MarkdownContent content={detailResult.analysis} />,
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
                {detailLoading ? (
                  <Spin tip="正在生成完整分析，可能需要 1~2 分钟..." />
                ) : (
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={handleGenerateDetail}
                    disabled={briefLoading || !briefResult || !!briefError}
                  >
                    生成完整 AI 分析
                  </Button>
                )}
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

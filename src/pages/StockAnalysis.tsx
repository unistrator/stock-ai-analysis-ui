import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
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
import { fetchStockAnalysis, fetchStockMapping, type StockOption } from "../utils/api";
import useIsMobile from "../hooks/useIsMobile";
import type { StockAnalysisResponse } from "../types";

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

function normalizeStockCode(code: string): string {
  return code.trim().toUpperCase();
}

interface ActiveQuery {
  code: string;
  startDate: string;
  endDate: string;
  controller: AbortController;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function searchStockOptions(
  options: StockOption[],
  input: string,
): { value: string; label: string }[] {
  const query = input.trim().toUpperCase();
  if (!query) return [];

  const results: { value: string; label: string }[] = [];
  for (const opt of options) {
    if (
      opt.value.toUpperCase().includes(query) ||
      opt.name.toUpperCase().includes(query)
    ) {
      results.push({ value: opt.value, label: opt.label });
      if (results.length >= MAX_SUGGESTIONS) break;
    }
  }
  return results;
}

export default function StockAnalysisPage() {
  const isMobile = useIsMobile();
  const [stockCode, setStockCode] = useState("000001.SZ");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(365, "day"),
    dayjs(),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StockAnalysisResponse | null>(null);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingError, setMappingError] = useState("");
  const activeQueryRef = useRef<ActiveQuery | null>(null);

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

  const selectedLabel = useMemo(() => {
    const matched =
      stockOptionByCode.get(stockCode) ??
      stockOptionByCode.get(normalizeStockCode(stockCode));
    return matched?.label ?? stockCode;
  }, [stockCode, stockOptionByCode]);

  const handleQuery = async () => {
    if (!stockCode.trim()) {
      message.warning("请输入股票代码");
      return;
    }

    const code = normalizeStockCode(stockCode);
    if (!dateRange[0] || !dateRange[1]) {
      setError("请选择完整的日期范围");
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

    const controller = new AbortController();
    activeQueryRef.current = { code, startDate, endDate, controller };

    setLoading(true);
    setError("");

    try {
      const data = await fetchStockAnalysis(code, startDate, endDate, controller.signal);
      if (activeQueryRef.current?.controller === controller) {
        setResult(data);
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      if (activeQueryRef.current?.controller === controller) {
        setResult(null);
        setError(e instanceof Error ? e.message : "查询失败");
      }
    } finally {
      if (activeQueryRef.current?.controller === controller) {
        setLoading(false);
        activeQueryRef.current = null;
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
                  : "输入股票代码或公司名称搜索，如 000001.SZ、平安银行"
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

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />
      )}

      {loading && (
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <Spin size="large" tip="正在调用分析服务，可能需要 10~30 秒..." />
        </div>
      )}

      {!loading && result && (
        <>
          <Card
            style={{ marginTop: 12 }}
            size={isMobile ? "small" : "default"}
            title={
              <Space wrap>
                <RobotOutlined style={{ color: "#1677ff" }} />
                <span>AI 摘要</span>
                <Tag color="processing">{result.stock_name ?? result.stock_code}</Tag>
              </Space>
            }
          >
            <MarkdownContent content={result.summary} compact />
          </Card>

          <Card
            title={`K 线图 · ${selectedLabel}`}
            size={isMobile ? "small" : "default"}
            style={{ marginTop: 12 }}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                悬停重要节点查看详情
              </Text>
            }
          >
            <KLineChart
              kline={result.kline}
              nodes={result.nodes}
              stockName={result.stock_name}
            />
            {result.nodes.length > 0 && (
              <Space wrap style={{ marginTop: 8 }}>
                {result.nodes.map((node) => (
                  <Tag key={`${node.date}-${node.type}`} color={NODE_TAG_COLORS[node.type] ?? "purple"}>
                    {node.date} {node.label}
                  </Tag>
                ))}
              </Space>
            )}
          </Card>

          <Card
            title="完整 AI 分析"
            size={isMobile ? "small" : "default"}
            style={{ marginTop: 12 }}
          >
            <MarkdownContent content={result.analysis} />
          </Card>
        </>
      )}

      {!loading && !result && !error && (
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

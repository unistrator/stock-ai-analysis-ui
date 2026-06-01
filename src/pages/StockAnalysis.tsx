import { useMemo, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
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
import { fetchStockAnalysis, STOCK_OPTIONS } from "../utils/api";
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

const STOCK_AUTOCOMPLETE_OPTIONS = STOCK_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label,
}));

function normalizeStockCode(code: string): string {
  return code.trim().toUpperCase();
}

function filterStockOption(input: string, option?: { value?: string; label?: string }) {
  const query = input.trim().toUpperCase();
  if (!query) return true;

  const value = (option?.value ?? "").toUpperCase();
  const label = (option?.label ?? "").toUpperCase();
  return value.includes(query) || label.includes(query);
}

export default function StockAnalysisPage() {
  const isMobile = useIsMobile();
  const [stockCode, setStockCode] = useState("000001.SZ");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("year"),
    dayjs(),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StockAnalysisResponse | null>(null);

  const selectedLabel = useMemo(
    () => STOCK_OPTIONS.find((o) => o.value === stockCode)?.label ?? stockCode,
    [stockCode],
  );

  const handleQuery = async () => {
    const code = normalizeStockCode(stockCode);
    if (!code) {
      setError("请输入股票代码");
      return;
    }
    if (!dateRange[0] || !dateRange[1]) {
      setError("请选择完整的日期范围");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchStockAnalysis(
        code,
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );
      setResult(data);
      setStockCode(code);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
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
              options={STOCK_AUTOCOMPLETE_OPTIONS}
              onChange={setStockCode}
              onSelect={(value) => setStockCode(normalizeStockCode(String(value)))}
              onBlur={() => setStockCode((prev) => normalizeStockCode(prev))}
              filterOption={filterStockOption}
              style={{ width: "100%" }}
              placeholder="输入或搜索股票代码，如 000001.SZ"
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
              loading={loading}
              onClick={handleQuery}
              block={isMobile}
              style={isMobile ? undefined : { minWidth: 120 }}
            >
              查询
            </Button>
          </Col>
        </Row>
      </Card>

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

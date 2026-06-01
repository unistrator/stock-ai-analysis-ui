import { useEffect, useState } from "react";
import { ConfigProvider, Layout, theme, Result, Button } from "antd";
import { LineChartOutlined } from "@ant-design/icons";
import ErrorBoundary from "./components/ErrorBoundary";
import StockAnalysisPage from "./pages/StockAnalysis";
import useIsMobile from "./hooks/useIsMobile";
import { checkAuth, clearToken } from "./utils/auth";
import "./global.css";

const { Header, Content } = Layout;

function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        width: "100%",
        background: "#fff",
      }}
    >
      <Result status="404" title="404 not found" />
    </div>
  );
}

function AppContent() {
  const isMobile = useIsMobile();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        className="app-header"
        style={{
          padding: isMobile ? "0 16px" : "0 24px",
          background: "#141414",
          borderBottom: "1px solid #303030",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LineChartOutlined style={{ color: "#1677ff", fontSize: 20 }} />
          <h3 style={{ color: "#fff", margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700 }}>
            股票 AI 分析
          </h3>
        </div>
        <Button
          type="link"
          size="small"
          danger
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
        >
          清除 Token
        </Button>
      </Header>
      <Content style={{ margin: isMobile ? 12 : 24 }}>
        <StockAnalysisPage />
      </Content>
    </Layout>
  );
}

export default function App() {
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAuthorized(checkAuth());
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!authorized) return <NotFound />;

  return (
    <ErrorBoundary>
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <AppContent />
      </ConfigProvider>
    </ErrorBoundary>
  );
}

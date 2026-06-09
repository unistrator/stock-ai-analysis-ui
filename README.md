# 股票 AI 分析 (Stock AI Analysis UI)

基于 React + TypeScript + Vite 构建的股票 AI 分析前端。输入股票代码与日期范围，调用后端「树形」分析接口，展示 K 线图、重要技术节点、AI 简要摘要与完整 AI 分析。

## 功能特性

- **股票智能搜索**：支持按代码、中文名称、拼音全拼 / 首字母（如 `000001.SZ`、`茅台`、`gzmt`）模糊匹配。
- **K 线图可视化**：基于 ECharts 的蜡烛图 + 成交量副图，标注突破 / 支撑 / 阻力 / 反转等重要节点，支持悬停查看节点详情。
- **AI 分析**：并行请求「简要分析」与「完整分析」两个接口，分别渲染 Markdown 内容（支持 GFM）。
- **查询历史**：本地保存最近 5 条查询记录，一键复用。
- **鉴权机制**：通过 URL `?token=` 注入 Token，写入 `localStorage` 后从地址栏移除；请求时同时携带 `Authorization` 头与 URL `token` 参数（双通道鉴权）。
- **响应式设计**：基于 Ant Design 暗色主题，适配桌面与移动端。
- **Mock 模式**：无需后端即可使用内置模拟数据进行本地开发与演示。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript 5 |
| 构建 | Vite 6 |
| UI | Ant Design 5（暗色主题）+ @ant-design/icons |
| 图表 | ECharts 5 + echarts-for-react |
| Markdown | react-markdown + remark-gfm |
| 日期 | dayjs |

## 环境要求

- Node.js >= 18
- npm >= 9

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（见下文）
cp .env.example .env.local

# 启动开发服务器（默认端口 5273）
npm run dev
```

启动后，需要在 URL 上附加 Token 访问，例如：

```
http://localhost:5273/?token=你的Token
```

> 若未携带有效 Token，页面会显示 404（鉴权失败）。本地调试可开启 Mock 模式（见下文）跳过真实接口，但仍需 Token 才能进入主界面。

## 环境变量

在项目根目录创建 `.env.local`（或 `.env`），可用变量如下：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_PROXY_TARGET` | 本地开发时的后端代理地址，设置后会代理 `/trees` 与 `/stock_codes` 请求。**不设置则接口请求不会被转发** | 无 |
| `VITE_BASE_PATH` | 前端部署的 base 路径 | `/` |
| `VITE_USE_MOCK` | 是否启用 Mock 数据（`true` / `false`） | `false` |
| `VITE_ANALYZE_BRIEF_URL` | 简要分析接口路径 | `/trees/analyze/brief` |
| `VITE_ANALYZE_DETAIL_URL` | 完整分析接口路径 | `/trees/analyze/detail` |
| `VITE_STOCK_MAPPING_URL` | 股票代码映射接口路径 | `/stock_codes/mapping` |

示例 `.env.local`：

```bash
# 本地开发：将接口代理到后端
VITE_PROXY_TARGET=http://47.236.167.129:5000

# 部署 base 路径
VITE_BASE_PATH=/

# 本地无后端时可开启 Mock
# VITE_USE_MOCK=true
```

> 注意：开发服务器代理超时设置为 300 秒（5 分钟），以适配分析接口冷启动与 LLM 长耗时场景。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查（`tsc -b`）并打包生产构建到 `dist/` |
| `npm run preview` | 本地预览生产构建产物 |

## 项目结构

```
src/
├── App.tsx                  # 应用入口、鉴权门控、主题与布局
├── main.tsx                 # React 渲染入口
├── global.css               # 全局样式与 Markdown 样式
├── types.ts                 # 共享类型定义
├── vite-env.d.ts            # 环境变量类型声明
├── pages/
│   └── StockAnalysis.tsx    # 主页面：查询条件、结果展示
├── components/
│   ├── KLineChart.tsx       # K 线 + 成交量图表
│   ├── MarkdownContent.tsx  # Markdown 渲染组件
│   └── ErrorBoundary.tsx    # 错误边界
├── hooks/
│   └── useIsMobile.ts       # 响应式断点判断
└── utils/
    ├── api.ts               # 接口请求与数据映射
    ├── auth.ts              # Token 鉴权
    ├── queryHistory.ts      # 查询历史（localStorage）
    └── mockData.ts          # Mock 数据生成
```

## 后端接口

应用依赖以下后端接口（均通过代理 / 重写访问）：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/trees/analyze/brief` | POST | 简要分析：返回 K 线数据、重要节点、总体摘要 |
| `/trees/analyze/detail` | POST | 完整分析：返回详细 AI 分析文本 |
| `/stock_codes/mapping` | GET | 股票代码—名称—拼音映射表 |

分析接口请求体示例：

```json
{
  "code": "000001.SZ",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "use_local_build": true,
  "overwrite": true,
  "temperature": null,
  "max_tokens": null,
  "extra_prompt": null
}
```

## 部署

项目已包含 `vercel.json`，通过 rewrites 将 `/trees/*` 与 `/stock_codes/*` 请求转发到后端。

部署到 Vercel：

```bash
# 直接推送到关联 Vercel 的仓库，或
vercel --prod
```

> 建议将 `vercel.json` 中写死的后端地址改为环境变量，避免环境耦合与地址暴露。

其他静态托管平台：执行 `npm run build` 后，将 `dist/` 目录部署到任意静态服务器，并在网关 / 反向代理层配置 `/trees`、`/stock_codes` 到后端的转发规则。

## 风险提示

本应用提供的所有分析内容均基于历史 K 线数据与模式识别，**不构成任何投资建议**。请结合基本面、宏观环境及自身风险承受能力独立决策。

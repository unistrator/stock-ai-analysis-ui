import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { KLinePoint, ImportantNode } from "../types";
import useIsMobile from "../hooks/useIsMobile";

const NODE_COLORS: Record<string, string> = {
  breakout: "#1677ff",
  support: "#52c41a",
  resistance: "#faad14",
  reversal: "#eb2f96",
  important: "#722ed1",
};

const TOOLTIP_WRAP_STYLE =
  "max-width:280px;white-space:normal;word-break:break-word;overflow-wrap:break-word;";
const TOOLTIP_TEXT_STYLE = `${TOOLTIP_WRAP_STYLE}line-height:1.5;`;

function normalizeDate(date: string): string {
  return date.split(" ")[0];
}

function findBarByDate(kline: KLinePoint[], dates: string[], date: string): KLinePoint | null {
  const normalized = normalizeDate(date);
  const idx = dates.indexOf(normalized);
  if (idx >= 0) return kline[idx];
  return kline.find((bar) => normalizeDate(bar.date) === normalized) ?? null;
}

interface Props {
  kline: KLinePoint[];
  nodes: ImportantNode[];
  stockName?: string;
}

export default function KLineChart({ kline, nodes, stockName }: Props) {
  const isMobile = useIsMobile();

  const option = useMemo(() => {
    const dates = kline.map((k) => k.date);
    const ohlc = kline.map((k) => [k.open, k.close, k.low, k.high]);
    const volumes = kline.map((k) => k.volume ?? 0);

    const nodeByDate = new Map(nodes.map((n) => [n.date, n]));
    const markPointData = nodes.map((node) => {
      const idx = dates.indexOf(node.date);
      const bar = idx >= 0 ? kline[idx] : null;
      const y = node.price ?? bar?.high ?? 0;
      return {
        name: node.label,
        coord: [node.date, y],
        value: node.label,
        symbol: "pin",
        symbolSize: isMobile ? 36 : 44,
        itemStyle: { color: NODE_COLORS[node.type] ?? "#1677ff" },
        label: {
          show: !isMobile,
          formatter: node.label,
          color: "#fff",
          fontSize: 10,
        },
        nodeMeta: node,
      };
    });

    const gridMargin = isMobile
      ? { left: 48, right: 16, top: 48, bottom: 56 }
      : { left: 64, right: 32, top: 56, bottom: 64 };

    return {
      backgroundColor: "transparent",
      animation: true,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        confine: true,
        backgroundColor: "rgba(20, 20, 20, 0.95)",
        borderColor: "#303030",
        textStyle: { color: "#fff" },
        extraCssText: TOOLTIP_WRAP_STYLE,
        formatter(params: unknown) {
          const items = Array.isArray(params) ? params : [params];
          const axisItem = items.find((p) => p?.axisValue != null);
          const date = normalizeDate(String(axisItem?.axisValue ?? items[0]?.name ?? ""));
          const vol = items.find((p) => p?.seriesName === "成交量");
          const bar = findBarByDate(kline, dates, date);
          const node = nodeByDate.get(date);

          let html = `<div style="font-weight:600;margin-bottom:6px">${date}${stockName ? ` · ${stockName}` : ""}</div>`;

          if (bar) {
            const { open, close, high, low } = bar;
            const color = close >= open ? "#ef5350" : "#26a69a";
            html += `<div style="color:${color}">`
              + `开 ${open.toFixed(2)} · 收 ${close.toFixed(2)}<br/>`
              + `高 ${high.toFixed(2)} · 低 ${low.toFixed(2)}`
              + `</div>`;
          }

          if (vol) {
            html += `<div style="margin-top:4px;color:rgba(255,255,255,0.65)">成交量 ${Number(vol.value).toLocaleString()}</div>`;
          }

          if (node) {
            html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #404040;${TOOLTIP_WRAP_STYLE}">`
              + `<span style="color:${NODE_COLORS[node.type] ?? "#1677ff"};font-weight:600">${node.label}</span><br/>`
              + `<span style="display:block;margin-top:4px;color:rgba(255,255,255,0.75);${TOOLTIP_TEXT_STYLE}">${node.description}</span>`
              + `</div>`;
          }

          return html;
        },
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
      },
      grid: [
        { ...gridMargin, height: isMobile ? "58%" : "62%" },
        { left: gridMargin.left, right: gridMargin.right, top: isMobile ? "74%" : "76%", height: "16%" },
      ],
      xAxis: [
        {
          type: "category",
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: "#434343" } },
          axisLabel: isMobile ? { rotate: 45, fontSize: 10, color: "rgba(255,255,255,0.65)" } : { color: "rgba(255,255,255,0.65)" },
          splitLine: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
        {
          type: "category",
          gridIndex: 1,
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: "#434343" } },
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
      ],
      yAxis: [
        {
          scale: true,
          splitArea: { show: false },
          axisLine: { lineStyle: { color: "#434343" } },
          axisLabel: { color: "rgba(255,255,255,0.65)" },
          splitLine: { lineStyle: { color: "#303030" } },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
        {
          show: !isMobile,
          xAxisIndex: [0, 1],
          type: "slider",
          bottom: 8,
          height: 18,
          borderColor: "#434343",
          fillerColor: "rgba(22, 119, 255, 0.15)",
          handleStyle: { color: "#1677ff" },
          textStyle: { color: "rgba(255,255,255,0.45)" },
        },
      ],
      series: [
        {
          name: "K线",
          type: "candlestick",
          data: ohlc,
          itemStyle: {
            color: "#ef5350",
            color0: "#26a69a",
            borderColor: "#ef5350",
            borderColor0: "#26a69a",
          },
          markPoint: {
            data: markPointData,
            tooltip: {
              trigger: "item",
              confine: true,
              backgroundColor: "rgba(20, 20, 20, 0.96)",
              borderColor: "#303030",
              textStyle: { color: "#fff" },
              extraCssText: TOOLTIP_WRAP_STYLE,
              formatter(param: unknown) {
                const node = (param as { data?: { nodeMeta?: ImportantNode } }).data?.nodeMeta;
                if (!node) return "";
                const bar = findBarByDate(kline, dates, node.date);
                let html = `<div style="${TOOLTIP_WRAP_STYLE}">`
                  + `<div style="font-weight:600;color:${NODE_COLORS[node.type] ?? "#1677ff"}">${node.label}</div>`
                  + `<div style="margin-top:4px;color:rgba(255,255,255,0.75)">${node.date}</div>`;

                if (bar) {
                  const color = bar.close >= bar.open ? "#ef5350" : "#26a69a";
                  html += `<div style="margin-top:6px;color:${color}">`
                    + `开 ${bar.open.toFixed(2)} · 收 ${bar.close.toFixed(2)}<br/>`
                    + `高 ${bar.high.toFixed(2)} · 低 ${bar.low.toFixed(2)}`
                    + `</div>`;
                }

                html += `<div style="margin-top:6px;${TOOLTIP_TEXT_STYLE}">${node.description}</div>`
                  + `</div>`;
                return html;
              },
            },
          },
        },
        {
          name: "成交量",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes.map((v, i) => ({
            value: v,
            itemStyle: {
              color: (kline[i].close >= kline[i].open ? "#ef5350" : "#26a69a") + "99",
            },
          })),
        },
      ],
    };
  }, [kline, nodes, stockName, isMobile]);

  return (
    <ReactECharts
      option={option}
      style={{ height: isMobile ? 380 : 480, width: "100%" }}
      notMerge
      lazyUpdate
    />
  );
}

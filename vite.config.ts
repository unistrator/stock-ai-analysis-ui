import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const PROXY_TIMEOUT_MS = 900_000; // 900s（15min），适配分析接口冷启动与 LLM 长耗时

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET;

  const treesProxy = proxyTarget
    ? {
        target: proxyTarget,
        changeOrigin: true,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setTimeout(PROXY_TIMEOUT_MS);
          });
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.setTimeout(PROXY_TIMEOUT_MS);
          });
        },
      }
    : undefined;

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || "/",
    server: {
      port: 5273,
      strictPort: false,
      proxy: treesProxy
        ? { "/trees": treesProxy, "/stock_codes": treesProxy }
        : undefined,
    },
    preview: {
      proxy: treesProxy
        ? { "/trees": treesProxy, "/stock_codes": treesProxy }
        : undefined,
    },
  };
});

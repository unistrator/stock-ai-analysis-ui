/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH: string;
  readonly VITE_PROXY_TARGET: string;
  readonly VITE_API_BASE: string;
  readonly VITE_ANALYZE_API_URL: string;
  readonly VITE_STOCK_MAPPING_URL: string;
  readonly VITE_USE_MOCK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

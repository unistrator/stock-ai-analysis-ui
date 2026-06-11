/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH: string;
  readonly VITE_PROXY_TARGET: string;
  readonly VITE_ANALYZE_BRIEF_URL: string;
  readonly VITE_ANALYZE_DETAIL_URL: string;
  readonly VITE_STOCK_MAPPING_URL: string;
  readonly VITE_USE_MOCK: string;
  readonly VITE_MOCK_BRIEF_STREAM: string;
  readonly VITE_MOCK_DETAIL_STREAM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

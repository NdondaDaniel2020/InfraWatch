/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SSE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_ENABLE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_SESSION_TTL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

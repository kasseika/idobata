interface ImportMeta {
  readonly env: {
    readonly BASE_URL: string;
    readonly VITE_API_BASE_URL: string;
    [key: string]: string | boolean | undefined;
  };
}

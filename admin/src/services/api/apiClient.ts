import { type Result, err, ok } from "neverthrow";
import { ApiError, ApiErrorType } from "./apiError";
import type {
  ChatThreadDetail,
  ChatThreadListResponse,
  ClusteringParams,
  ClusteringResult,
  CreateThemePayload,
  CreateUserPayload,
  EmergencyUpdatePipelineConfigPayload,
  InitializeAdminResponse,
  LoginCredentials,
  LoginResponse,
  PipelineStageDefault,
  Question,
  SetupStatusResponse,
  SiteConfig,
  SystemConfig,
  Theme,
  ThemeImportStats,
  UpdateSiteConfigPayload,
  UpdateSystemConfigPayload,
  UpdateThemePayload,
  UserResponse,
  VectorSearchParams,
  VectorSearchResult,
} from "./types";

export type ApiResult<T> = Result<T, ApiError>;

export class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${import.meta.env.VITE_API_BASE_URL}/api`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const token = localStorage.getItem("auth_token");
    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          errorData.message ||
          `API request failed with status ${response.status}`;

        let errorType: ApiErrorType;
        switch (response.status) {
          case 400:
            errorType = ApiErrorType.VALIDATION_ERROR;
            break;
          case 401:
            errorType = ApiErrorType.UNAUTHORIZED;
            break;
          case 403:
            errorType = ApiErrorType.FORBIDDEN;
            break;
          case 404:
            errorType = ApiErrorType.NOT_FOUND;
            break;
          case 500:
          case 502:
          case 503:
            errorType = ApiErrorType.SERVER_ERROR;
            break;
          default:
            errorType = ApiErrorType.UNKNOWN_ERROR;
        }

        return err(new ApiError(errorType, message, response.status));
      }

      const data = await response.json();
      return ok(data);
    } catch (error) {
      return err(
        new ApiError(
          ApiErrorType.NETWORK_ERROR,
          error instanceof Error ? error.message : "Network error occurred"
        )
      );
    }
  }

  async getAllThemes(): Promise<ApiResult<Theme[]>> {
    return this.request<Theme[]>("/themes?includeInactive=true");
  }

  async getThemeById(id: string): Promise<ApiResult<Theme>> {
    return this.request<Theme>(`/themes/${id}`);
  }

  async createTheme(theme: CreateThemePayload): Promise<ApiResult<Theme>> {
    return this.request<Theme>("/themes", {
      method: "POST",
      body: JSON.stringify(theme),
    });
  }

  async updateTheme(
    id: string,
    theme: UpdateThemePayload
  ): Promise<ApiResult<Theme>> {
    return this.request<Theme>(`/themes/${id}`, {
      method: "PUT",
      body: JSON.stringify(theme),
    });
  }

  async deleteTheme(id: string): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>(`/themes/${id}`, {
      method: "DELETE",
    });
  }

  async getSetupStatus(): Promise<ApiResult<SetupStatusResponse>> {
    return this.request<SetupStatusResponse>("/auth/setup-status");
  }

  async initializeAdmin(
    data: CreateUserPayload
  ): Promise<ApiResult<InitializeAdminResponse>> {
    return this.request<InitializeAdminResponse>("/auth/initialize", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(
    email: string,
    password: string
  ): Promise<ApiResult<LoginResponse>> {
    return this.request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getCurrentUser(): Promise<ApiResult<UserResponse>> {
    return this.request<UserResponse>("/auth/me");
  }

  async createUser(
    userData: CreateUserPayload
  ): Promise<ApiResult<UserResponse>> {
    return this.request<UserResponse>("/auth/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async getSiteConfig(): Promise<ApiResult<SiteConfig>> {
    return this.request<SiteConfig>("/site-config");
  }

  async updateSiteConfig(
    config: UpdateSiteConfigPayload
  ): Promise<ApiResult<SiteConfig>> {
    return this.request<SiteConfig>("/site-config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async getSystemConfig(): Promise<ApiResult<SystemConfig>> {
    return this.request<SystemConfig>("/system-config");
  }

  async updateSystemConfig(
    payload: UpdateSystemConfigPayload
  ): Promise<ApiResult<SystemConfig>> {
    return this.request<SystemConfig>("/system-config", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteSystemConfig(): Promise<ApiResult<SystemConfig>> {
    return this.request<SystemConfig>("/system-config", {
      method: "DELETE",
    });
  }

  async generateThemeEmbeddings(
    themeId: string,
    itemType?: "problem" | "solution"
  ): Promise<ApiResult<{ status: string; processedCount: number }>> {
    return this.request<{ status: string; processedCount: number }>(
      `/themes/${themeId}/embeddings/generate`,
      {
        method: "POST",
        body: JSON.stringify({ itemType }),
      }
    );
  }

  async searchTheme(
    themeId: string,
    params: VectorSearchParams
  ): Promise<ApiResult<VectorSearchResult[]>> {
    // Manually encode the query parameters to ensure proper handling of non-ASCII characters
    const queryText = encodeURIComponent(params.queryText);
    const itemType = encodeURIComponent(params.itemType);
    const kParam = params.k
      ? `&k=${encodeURIComponent(params.k.toString())}`
      : "";
    const modelParam = params.model
      ? `&model=${encodeURIComponent(params.model)}`
      : "";

    const queryString = `queryText=${queryText}&itemType=${itemType}${kParam}${modelParam}`;

    return this.request<VectorSearchResult[]>(
      `/themes/${themeId}/search?${queryString}`
    );
  }

  async clusterTheme(
    themeId: string,
    params: ClusteringParams
  ): Promise<ApiResult<ClusteringResult>> {
    return this.request<ClusteringResult>(`/themes/${themeId}/cluster`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getQuestionsByTheme(themeId: string): Promise<ApiResult<Question[]>> {
    return this.request<Question[]>(`/themes/${themeId}/questions`);
  }

  async generateQuestions(themeId: string): Promise<ApiResult<void>> {
    return this.request<void>(`/themes/${themeId}/generate-questions`, {
      method: "POST",
    });
  }

  async getDefaultPrompt(): Promise<ApiResult<{ defaultPrompt: string }>> {
    return this.request<{ defaultPrompt: string }>("/themes/default-prompt");
  }

  async getPipelineDefaults(): Promise<
    ApiResult<{ stages: PipelineStageDefault[] }>
  > {
    return this.request<{ stages: PipelineStageDefault[] }>(
      "/themes/pipeline-defaults"
    );
  }

  async generateVisualReport(
    themeId: string,
    questionId: string
  ): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>(
      `/themes/${themeId}/questions/${questionId}/generate-visual-report`,
      {
        method: "POST",
      }
    );
  }

  async generateReportExample(
    themeId: string,
    questionId: string
  ): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>(
      `/themes/${themeId}/questions/${questionId}/generate-report`,
      {
        method: "POST",
      }
    );
  }

  async generateDebateAnalysis(
    themeId: string,
    questionId: string
  ): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>(
      `/themes/${themeId}/questions/${questionId}/generate-debate-analysis`,
      {
        method: "POST",
      }
    );
  }

  async emergencyUpdatePipelineConfig(
    themeId: string,
    payload: EmergencyUpdatePipelineConfigPayload
  ): Promise<ApiResult<Theme>> {
    return this.request<Theme>(
      `/themes/${themeId}/pipeline-config/emergency-update`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * テーマデータをJSONファイルとしてダウンロードする
   *
   * @param themeId - エクスポート対象のテーマID
   * @param includeLikes - いいねデータを含めるか（デフォルト: false）
   */
  async exportTheme(
    themeId: string,
    includeLikes = false
  ): Promise<ApiResult<void>> {
    const url = `${this.baseUrl}/themes/${themeId}/export?includeLikes=${includeLikes}`;
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 401) {
          return err(new ApiError(ApiErrorType.UNAUTHORIZED, "認証が必要です"));
        }
        if (response.status === 403) {
          return err(
            new ApiError(ApiErrorType.FORBIDDEN, "アクセス権限がありません")
          );
        }
        if (response.status === 404) {
          return err(
            new ApiError(ApiErrorType.NOT_FOUND, "テーマが見つかりません")
          );
        }
        return err(
          new ApiError(
            ApiErrorType.UNKNOWN_ERROR,
            `エクスポートに失敗しました: ${response.status}`
          )
        );
      }

      // RFC 5987 形式（filename*=UTF-8''...）を優先してファイル名を取得する
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const rfc5987Match = disposition.match(/filename\*=UTF-8''([^\s;]+)/i);
      const legacyMatch = disposition.match(/filename="([^"]+)"/);
      const rawFilename = rfc5987Match?.[1] ?? legacyMatch?.[1] ?? null;
      let filename = `theme-export-${themeId}.json`;
      if (rawFilename) {
        try {
          filename = decodeURIComponent(rawFilename);
        } catch {
          // URIError が発生した場合はデフォルトのファイル名を使用する
          filename = `theme-export-${themeId}.json`;
        }
      }

      // Blob としてダウンロードをトリガー
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);

      return ok(undefined);
    } catch (error) {
      return err(
        new ApiError(
          ApiErrorType.NETWORK_ERROR,
          "ネットワークエラーが発生しました"
        )
      );
    }
  }

  /**
   * テーマデータをインポートして新しいテーマを作成する
   *
   * @param exportData - ThemeExportData 形式のJSONオブジェクト
   */
  async importTheme(exportData: unknown): Promise<ApiResult<ThemeImportStats>> {
    return this.request<ThemeImportStats>("/themes/import", {
      method: "POST",
      body: JSON.stringify(exportData),
    });
  }

  /**
   * テーマのチャットスレッド一覧を管理者として取得する
   *
   * @param themeId - テーマID
   * @param params - ページネーションパラメータ（page, limit）
   */
  async getChatThreadsByTheme(
    themeId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ApiResult<ChatThreadListResponse>> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    const queryStr = query.toString() ? `?${query.toString()}` : "";
    return this.request<ChatThreadListResponse>(
      `/themes/${themeId}/chat/admin/threads${queryStr}`
    );
  }

  /**
   * スレッドのメッセージ詳細を取得する
   *
   * @param themeId - テーマID
   * @param threadId - スレッドID
   */
  async getChatThreadMessages(
    themeId: string,
    threadId: string
  ): Promise<ApiResult<ChatThreadDetail>> {
    return this.request<ChatThreadDetail>(
      `/themes/${themeId}/chat/admin/threads/${threadId}/messages`
    );
  }
}

export const apiClient = new ApiClient();

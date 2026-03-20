import { ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";
import React, { useState, useEffect } from "react";
import type { ChangeEvent, FC, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../services/api/apiClient";
import { ApiErrorType } from "../../services/api/apiError";
import type {
  CreateThemePayload,
  EmergencyUpdatePipelineConfigPayload,
  PipelineStageConfig,
  PipelineStageDefault,
  Question,
  Theme,
  ThemeStatus,
  UpdateThemePayload,
} from "../../services/api/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/**
 * OpenRouter 経由で利用可能なモデル一覧
 * プロバイダーごとにグループ化して表示する
 * 価格表記: $入力/$出力 per million tokens / ctx: コンテキストウィンドウサイズ
 */
const AVAILABLE_MODELS: {
  group: string;
  models: { value: string; label: string }[];
}[] = [
  {
    group: "Google Gemini",
    models: [
      {
        value: "google/gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash Lite ($0.25/$1.50/M, 1Mctx)",
      },
      {
        value: "google/gemini-3-flash-preview",
        label: "Gemini 3 Flash ($0.50/$3/M, 1Mctx)",
      },
      {
        value: "google/gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro ($2/$12/M, 1Mctx)",
      },
    ],
  },
  {
    group: "Anthropic Claude",
    models: [
      {
        value: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6 ($3/$15/M, 1Mctx)",
      },
      {
        value: "anthropic/claude-opus-4.6",
        label: "Claude Opus 4.6 ($5/$25/M, 1Mctx)",
      },
    ],
  },
  {
    group: "OpenAI",
    models: [
      {
        value: "openai/gpt-5.4-mini",
        label: "GPT-5.4 Mini ($0.75/$4.50/M, 400Kctx)",
      },
      { value: "openai/gpt-5.4", label: "GPT-5.4 ($2.50/$15/M, 1Mctx)" },
    ],
  },
];

/**
 * 指定したモデルIDが AVAILABLE_MODELS に含まれているか判定する
 */
function isKnownModel(modelId: string): boolean {
  return AVAILABLE_MODELS.some((group) =>
    group.models.some((m) => m.value === modelId)
  );
}

interface ThemeFormProps {
  theme?: Theme;
  isEdit?: boolean;
}

const ThemeForm: FC<ThemeFormProps> = ({ theme, isEdit = false }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<
    CreateThemePayload | UpdateThemePayload
  >({
    title: "",
    description: "",
    slug: "",
    status: "draft",
    tags: [],
    pipelineConfig: {},
  });
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyTarget, setEmergencyTarget] = useState<{
    stageId: string;
    field: "model" | "prompt";
  } | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyNewValue, setEmergencyNewValue] = useState("");
  // 保存済みステータス（未保存の formData.status と分離して管理）
  const [savedStatus, setSavedStatus] = useState<ThemeStatus>(
    theme?.status ?? "draft"
  );
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pipelineDefaults, setPipelineDefaults] = useState<
    PipelineStageDefault[]
  >([]);
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>(
    {}
  );

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null
  );
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingReports, setIsGeneratingReports] = useState<
    Record<string, boolean>
  >({});
  const [isGeneratingDebateAnalysis, setIsGeneratingDebateAnalysis] = useState<
    Record<string, boolean>
  >({});
  const [isGeneratingVisualReport, setIsGeneratingVisualReport] =
    useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && theme) {
      setFormData({
        title: theme.title,
        description: theme.description || "",
        slug: theme.slug,
        status: theme.status || "draft",
        tags: theme.tags || [],
        pipelineConfig: theme.pipelineConfig || {},
      });
      setSavedStatus(theme.status ?? "draft");
    }
  }, [isEdit, theme]);

  // パイプラインステージのデフォルト設定をAPIから取得する
  useEffect(() => {
    const loadPipelineDefaults = async () => {
      const result = await apiClient.getPipelineDefaults();
      if (result.isOk()) {
        setPipelineDefaults(result.value.stages);
      } else {
        console.error(
          "パイプラインデフォルト設定の取得に失敗しました:",
          result.error
        );
        setQuestionsError(
          "パイプライン設定の読み込みに失敗しました。ページを再読み込みしてください。"
        );
      }
    };
    loadPipelineDefaults();
  }, []);

  // pipelineDefaults ロード後に formData.pipelineConfig をデフォルト値で初期化する
  // 既存のテーマ設定がある場合はその値を優先し、未設定のステージにはデフォルト値を補完する
  useEffect(() => {
    if (pipelineDefaults.length === 0) return;
    setFormData((prev) => {
      const currentConfig = prev.pipelineConfig || {};
      const mergedConfig: Record<string, PipelineStageConfig> = {};
      for (const stage of pipelineDefaults) {
        mergedConfig[stage.id] = {
          model: currentConfig[stage.id]?.model ?? stage.defaultModel,
          prompt: currentConfig[stage.id]?.prompt ?? stage.defaultPrompt,
        };
      }
      return { ...prev, pipelineConfig: mergedConfig };
    });
  }, [pipelineDefaults, theme?.pipelineConfig]);

  useEffect(() => {
    if (isEdit && theme?._id) {
      fetchQuestions(theme._id);
    }
  }, [isEdit, theme?._id]);

  const fetchQuestions = async (themeId: string) => {
    setIsLoadingQuestions(true);
    setQuestionsError(null);

    const result = await apiClient.getQuestionsByTheme(themeId);

    if (result.isErr()) {
      console.error("Failed to fetch questions:", result.error);
      setQuestionsError("重要論点の読み込みに失敗しました。");
      setIsLoadingQuestions(false);
      return;
    }

    setQuestions(result.value);
    setIsLoadingQuestions(false);
  };

  const handleGenerateQuestions = async () => {
    if (!theme?._id) return;

    setIsGeneratingQuestions(true);
    setQuestionsError(null);
    setSuccessMessage(null);

    const result = await apiClient.generateQuestions(theme._id);

    if (result.isErr()) {
      console.error("Failed to generate questions:", result.error);
      setQuestionsError("重要論点の生成に失敗しました。");
      setIsGeneratingQuestions(false);
      return;
    }

    setSuccessMessage(
      "重要論点の生成を開始しました。しばらくすると重要論点リストに表示されます。"
    );

    setTimeout(() => {
      fetchQuestions(theme._id);
    }, 5000);

    setIsGeneratingQuestions(false);
  };

  const handleGenerateVisualReport = async () => {
    if (!theme?._id || !selectedQuestionId) return;

    setIsGeneratingVisualReport(true);
    setQuestionsError(null);
    setSuccessMessage(null);

    const result = await apiClient.generateVisualReport(
      theme._id,
      selectedQuestionId
    );

    if (result.isErr()) {
      console.error("Failed to generate visual report:", result.error);
      setQuestionsError("ビジュアルレポートの生成に失敗しました。");
      setIsGeneratingVisualReport(false);
      return;
    }

    setSuccessMessage(
      "ビジュアルレポートの生成を開始しました。しばらくすると重要論点の詳細画面で確認できます。"
    );

    setIsGeneratingVisualReport(false);
  };

  const handleGenerateReport = async (
    questionId: string,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.stopPropagation();
    }

    if (!theme?._id) return;

    setIsGeneratingReports((prev) => ({ ...prev, [questionId]: true }));
    setQuestionsError(null);
    setSuccessMessage(null);

    const result = await apiClient.generateReportExample(theme._id, questionId);

    if (result.isErr()) {
      console.error("Failed to generate report:", result.error);
      setQuestionsError("市民意見レポート例の生成に失敗しました。");
      setIsGeneratingReports((prev) => ({ ...prev, [questionId]: false }));
      return;
    }

    setSuccessMessage(
      "市民意見レポート例の生成を開始しました。生成には数分かかる場合があります。"
    );
    setIsGeneratingReports((prev) => ({ ...prev, [questionId]: false }));
  };

  const handleGenerateDebateAnalysis = async (
    questionId: string,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.stopPropagation();
    }

    if (!theme?._id) return;

    setIsGeneratingDebateAnalysis((prev) => ({ ...prev, [questionId]: true }));
    setQuestionsError(null);
    setSuccessMessage(null);

    const result = await apiClient.generateDebateAnalysis(
      theme._id,
      questionId
    );

    if (result.isErr()) {
      console.error("Failed to generate debate analysis:", result.error);
      setQuestionsError("議論分析の生成に失敗しました。");
      setIsGeneratingDebateAnalysis((prev) => ({
        ...prev,
        [questionId]: false,
      }));
      return;
    }

    setSuccessMessage(
      "議論分析の生成を開始しました。生成には数分かかる場合があります。"
    );
    setIsGeneratingDebateAnalysis((prev) => ({
      ...prev,
      [questionId]: false,
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleToggleVisibility = () => {
    alert("未実装です。");
  };

  /**
   * 現在のステータスから遷移可能な次のステータス一覧を返す
   */
  const getAllowedNextStatuses = (current: ThemeStatus): ThemeStatus[] => {
    const transitions: Record<ThemeStatus, ThemeStatus[]> = {
      draft: ["active"],
      active: ["closed"],
      closed: [], // 終端状態
    };
    return transitions[current] ?? [];
  };

  /**
   * ステータスの日本語ラベルを返す
   */
  const getStatusLabel = (status: ThemeStatus): string => {
    const labels: Record<ThemeStatus, string> = {
      draft: "下書き",
      active: "公開中",
      closed: "終了",
    };
    return labels[status] ?? status;
  };

  /**
   * 緊急修正モーダルを開く
   */
  const openEmergencyModal = (stageId: string, field: "model" | "prompt") => {
    const stageConfig = formData.pipelineConfig?.[stageId] || {};
    const currentValue =
      field === "model"
        ? (stageConfig.model ?? "")
        : (stageConfig.prompt ?? "");
    setEmergencyTarget({ stageId, field });
    setEmergencyReason("");
    setEmergencyNewValue(currentValue);
    setEmergencyModalOpen(true);
  };

  /**
   * 緊急修正を送信する
   */
  const handleEmergencySubmit = async () => {
    if (!theme?._id || !emergencyTarget || !emergencyReason.trim()) return;

    const payload: EmergencyUpdatePipelineConfigPayload = {
      stageId: emergencyTarget.stageId,
      reason: emergencyReason,
      ...(emergencyTarget.field === "model"
        ? { model: emergencyNewValue }
        : { prompt: emergencyNewValue }),
    };

    const result = await apiClient.emergencyUpdatePipelineConfig(
      theme._id,
      payload
    );

    if (result.isErr()) {
      alert(`緊急修正に失敗しました: ${result.error.message}`);
      return;
    }

    setSuccessMessage("緊急修正が完了しました。変更はログに記録されました。");
    setEmergencyModalOpen(false);
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  /**
   * パイプラインステージの開閉状態を切り替える
   */
  const toggleStage = (stageId: string) => {
    setExpandedStages((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  /**
   * パイプラインステージのモデルまたはプロンプトを更新する
   */
  const handlePipelineConfigChange = (
    stageId: string,
    field: keyof PipelineStageConfig,
    value: string
  ) => {
    setFormData((prev) => {
      const currentConfig = prev.pipelineConfig || {};
      const stageConfig = currentConfig[stageId] || {};
      return {
        ...prev,
        pipelineConfig: {
          ...currentConfig,
          [stageId]: { ...stageConfig, [field]: value },
        },
      };
    });
  };

  /**
   * 指定ステージの設定をデフォルト値に戻す
   */
  const resetStageConfig = (stageId: string) => {
    const stage = pipelineDefaults.find((s) => s.id === stageId);
    if (!stage) return;
    setFormData((prev) => ({
      ...prev,
      pipelineConfig: {
        ...(prev.pipelineConfig || {}),
        [stageId]: { model: stage.defaultModel, prompt: stage.defaultPrompt },
      },
    }));
  };

  /**
   * タグ入力欄でEnterキーまたはカンマが押されたときにタグを追加する
   */
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  /**
   * formDataからタグ配列を型安全に取得するヘルパー
   */
  const getTags = (): string[] => formData.tags ?? [];

  /**
   * タグ入力欄の値をタグとして追加する
   * setFormDataのfunctional updaterパターンを使用してstale stateを防ぐ
   */
  const addTag = () => {
    const trimmed = tagInput.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (trimmed.length > 50) {
      setErrors((prev) => ({
        ...prev,
        tagInput: "タグは50文字以内で入力してください",
      }));
      return;
    }
    setErrors((prev) => ({ ...prev, tagInput: "" }));
    setFormData((prev) => {
      const prevTags = prev.tags ?? [];
      if (prevTags.includes(trimmed)) return prev;
      return { ...prev, tags: [...prevTags, trimmed] };
    });
    setTagInput("");
  };

  /**
   * 指定インデックスのタグを削除する
   * setFormDataのfunctional updaterパターンを使用してstale stateを防ぐ
   */
  const removeTag = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).filter((_, i) => i !== index),
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title) {
      newErrors.title = "タイトルは必須です";
    }

    if (!formData.slug) {
      newErrors.slug = "スラッグは必須です";
    } else if (!/^[a-z0-9-]+$/.test(formData.slug as string)) {
      newErrors.slug = "スラッグは小文字、数字、ハイフンのみ使用できます";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    if (isEdit && theme) {
      const result = await apiClient.updateTheme(theme._id, formData);

      result.match(
        () => {
          navigate("/themes");
        },
        (error) => {
          console.error("Form submission error:", error);

          if (error.type === ApiErrorType.VALIDATION_ERROR) {
            setErrors({ form: error.message });
          } else {
            alert(`エラーが発生しました: ${error.message}`);
          }
        }
      );
    } else {
      const result = await apiClient.createTheme(
        formData as CreateThemePayload
      );

      result.match(
        () => {
          navigate("/themes");
        },
        (error) => {
          console.error("Form submission error:", error);

          if (error.type === ApiErrorType.VALIDATION_ERROR) {
            setErrors({ form: error.message });
          } else {
            alert(`エラーが発生しました: ${error.message}`);
          }
        }
      );
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-8xl">
      {errors.form && (
        <div className="bg-destructive/20 text-destructive-foreground p-4 rounded mb-4">
          {errors.form}
        </div>
      )}

      <div className="mb-4">
        <label
          htmlFor="title"
          className="block text-foreground font-medium mb-2"
        >
          タイトル
          <span className="text-destructive ml-1">*</span>
        </label>
        <Input
          id="title"
          name="title"
          value={formData.title as string}
          onChange={handleChange}
          className={errors.title ? "border-destructive" : ""}
        />
        {errors.title && (
          <p className="text-destructive text-sm mt-1">{errors.title}</p>
        )}
      </div>

      <div className="mb-4">
        <label
          htmlFor="description"
          className="block text-foreground font-medium mb-2"
        >
          説明
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          rows={4}
        />
      </div>

      <div className="mb-4">
        <label
          htmlFor="slug"
          className="block text-foreground font-medium mb-2"
        >
          スラッグ
          <span className="text-destructive ml-1">*</span>
        </label>
        <Input
          id="slug"
          name="slug"
          value={formData.slug as string}
          onChange={handleChange}
          className={errors.slug ? "border-destructive" : ""}
          placeholder="例: my-theme-slug"
        />
        {errors.slug && (
          <p className="text-destructive text-sm mt-1">{errors.slug}</p>
        )}
      </div>

      <div className="mb-4">
        <label
          htmlFor="status"
          className="block text-foreground font-medium mb-2"
        >
          ステータス
        </label>
        <div className="flex items-center gap-3">
          <select
            id="status"
            name="status"
            value={(formData as UpdateThemePayload).status ?? "draft"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                status: e.target.value as ThemeStatus,
              }))
            }
            className="h-10 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {/* 保存済みステータス（現在）を先頭に固定表示 */}
            <option value={savedStatus}>
              {getStatusLabel(savedStatus)}（現在）
            </option>
            {/* 遷移可能な次のステータス */}
            {getAllowedNextStatuses(savedStatus).map((s) => (
              <option key={s} value={s}>
                {getStatusLabel(s)}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            {savedStatus === "active" &&
              "公開中：プロンプト変更はロックされています（緊急修正ボタンを使用）"}
            {savedStatus === "closed" &&
              "終了：プロンプト変更はロックされています"}
            {savedStatus === "draft" && "下書き：すべての設定を編集できます"}
          </p>
        </div>
      </div>

      {/* プロンプトロック中の警告 */}
      {(savedStatus === "active" || savedStatus === "closed") && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 text-sm">
            ステータスが「{getStatusLabel(savedStatus)}
            」のため、AIパイプライン設定（プロンプト・モデル）は編集できません。
            {savedStatus === "active" && (
              <span>
                {" "}
                変更が必要な場合は各ステージの「緊急修正」ボタンを使用してください。
              </span>
            )}
          </p>
        </div>
      )}

      <div className="mb-4">
        <p className="block text-foreground font-medium mb-2">
          AIパイプライン設定
        </p>
        <p className="text-muted-foreground text-sm mb-3">
          各AIステージで使用するモデルとプロンプトをテーマ単位でカスタマイズできます。デフォルト値が入力済みなので、変えたい箇所だけ編集してください。
        </p>
        {(() => {
          // isLocked は保存済みステータス（savedStatus）に基づく
          // 理由: 未保存の formData.status で判定すると、draft→active 選択中に
          //       保存前の画面でフォームがロックされてしまう
          const isLocked = savedStatus === "active" || savedStatus === "closed";
          return (
            <div className="space-y-2">
              {pipelineDefaults.map((stage) => {
                const stageConfig = formData.pipelineConfig?.[stage.id] || {};
                const isExpanded = expandedStages[stage.id] || false;
                const isCustomized =
                  stageConfig.model !== stage.defaultModel ||
                  stageConfig.prompt !== stage.defaultPrompt;
                return (
                  <div
                    key={stage.id}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted text-left"
                      onClick={() => toggleStage(stage.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">
                          {stage.name}
                        </span>
                        {isCustomized && (
                          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                            カスタム設定
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            編集ロック中
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {stage.description}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-background">
                        <div>
                          <label
                            htmlFor={`stage-${stage.id}-model`}
                            className="block text-sm font-medium mb-1"
                          >
                            モデル
                          </label>
                          <div className="flex gap-2">
                            <select
                              id={`stage-${stage.id}-model`}
                              value={stageConfig.model ?? stage.defaultModel}
                              onChange={(e) =>
                                handlePipelineConfigChange(
                                  stage.id,
                                  "model",
                                  e.target.value
                                )
                              }
                              disabled={isLocked}
                              className="flex-1 h-10 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {/* 保存済みモデルがドロップダウンに存在しない場合（非推奨モデル等）、先頭に動的追加して設定を保持する */}
                              {!isKnownModel(
                                stageConfig.model ?? stage.defaultModel
                              ) && (
                                <option
                                  value={
                                    stageConfig.model ?? stage.defaultModel
                                  }
                                >
                                  {stageConfig.model ?? stage.defaultModel}{" "}
                                  (カスタム)
                                </option>
                              )}
                              {AVAILABLE_MODELS.map((group) => (
                                <optgroup key={group.group} label={group.group}>
                                  {group.models.map((m) => (
                                    <option key={m.value} value={m.value}>
                                      {m.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            {savedStatus === "active" && isEdit && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  openEmergencyModal(stage.id, "model")
                                }
                              >
                                緊急修正
                              </Button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor={`stage-${stage.id}-prompt`}
                            className="block text-sm font-medium mb-1"
                          >
                            プロンプト
                          </label>
                          <div className="flex flex-col gap-2">
                            <textarea
                              id={`stage-${stage.id}-prompt`}
                              value={stageConfig.prompt ?? stage.defaultPrompt}
                              onChange={(e) =>
                                handlePipelineConfigChange(
                                  stage.id,
                                  "prompt",
                                  e.target.value
                                )
                              }
                              disabled={isLocked}
                              className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              rows={8}
                            />
                            {savedStatus === "active" && isEdit && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  openEmergencyModal(stage.id, "prompt")
                                }
                                className="self-start"
                              >
                                緊急修正
                              </Button>
                            )}
                          </div>
                        </div>
                        {isCustomized && !isLocked && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => resetStageConfig(stage.id)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            デフォルトに戻す
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className="mb-4">
        <label
          htmlFor="tagInput"
          className="block text-foreground font-medium mb-2"
        >
          タグ
          <span className="text-muted-foreground ml-1 text-sm">(省略可)</span>
        </label>
        <div className="flex gap-2 mb-2">
          <Input
            id="tagInput"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder="タグを入力してEnterまたはカンマで追加"
            className="flex-1"
            maxLength={50}
          />
        </div>
        {errors.tagInput && (
          <p className="text-destructive text-sm mt-1">{errors.tagInput}</p>
        )}
        {getTags().length > 0 && (
          <div className="flex flex-wrap gap-1">
            {getTags().map((tag, index) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 border bg-primary-100 text-primary-800 rounded-full px-2 py-0.5 text-xs"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  className="text-primary-600 hover:text-primary-900"
                  aria-label={`タグ「${tag}」を削除`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex space-x-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "送信中..." : isEdit ? "更新" : "作成"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate("/themes")}
        >
          キャンセル
        </Button>
      </div>

      {/* 緊急修正モーダル */}
      {emergencyModalOpen && emergencyTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-lg w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">緊急修正</h3>
            <p className="text-sm text-muted-foreground mb-4">
              公開中テーマの
              {emergencyTarget.field === "model" ? "モデル" : "プロンプト"}
              を変更します。変更理由はログに記録され、透明性ページで公開されます。
            </p>
            <div className="mb-4">
              <label
                htmlFor="emergencyNewValue"
                className="block text-sm font-medium mb-1"
              >
                新しい
                {emergencyTarget.field === "model" ? "モデル" : "プロンプト"}
                <span className="text-destructive ml-1">*</span>
              </label>
              {emergencyTarget.field === "model" ? (
                <select
                  id="emergencyNewValue"
                  value={emergencyNewValue}
                  onChange={(e) => setEmergencyNewValue(e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {AVAILABLE_MODELS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.models.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <textarea
                  id="emergencyNewValue"
                  value={emergencyNewValue}
                  onChange={(e) => setEmergencyNewValue(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  rows={6}
                  placeholder="新しいプロンプトを入力"
                />
              )}
            </div>
            <div className="mb-4">
              <label
                htmlFor="emergencyReason"
                className="block text-sm font-medium mb-1"
              >
                変更理由
                <span className="text-destructive ml-1">*</span>
              </label>
              <textarea
                id="emergencyReason"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                rows={3}
                placeholder="例: プロンプトの誤字を修正"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEmergencyModalOpen(false)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleEmergencySubmit}
                disabled={!emergencyReason.trim() || !emergencyNewValue.trim()}
              >
                修正を適用
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sharp Questions Section - Only show in edit mode */}
      {isEdit && theme?._id && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            このテーマに紐づく重要論点
          </h2>

          {questionsError && (
            <div className="mb-4 p-4 bg-destructive/20 border border-destructive/30 rounded-lg text-destructive-foreground text-sm">
              <p className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-label="エラーアイコン"
                  role="img"
                >
                  <title>エラーアイコン</title>
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {questionsError}
              </p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-4 bg-success/80 border border-success/90 rounded-lg text-success-foreground text-sm">
              <p className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-label="成功アイコン"
                  role="img"
                >
                  <title>成功アイコン</title>
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {successMessage}
              </p>
            </div>
          )}

          {/* Generation Button */}
          <div className="mb-6 p-4 bg-background rounded-lg border border-border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-primary-dark mb-1">
                  重要論点生成
                </h3>
                <p className="text-sm text-muted-foreground">
                  課題データから新しい重要論点を生成します
                </p>
              </div>
              <button
                onClick={handleGenerateQuestions}
                disabled={isGeneratingQuestions}
                className="btn bg-primary text-primary-foreground px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm whitespace-nowrap hover:bg-primary/90"
                type="button"
              >
                {isGeneratingQuestions ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-label="読み込み中"
                      role="img"
                    >
                      <title>読み込み中</title>
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    生成中...
                  </span>
                ) : questions.length === 0 ? (
                  "生成する"
                ) : (
                  "さらに生成する"
                )}
              </button>
            </div>
          </div>

          {/* Questions List */}
          <div className="bg-background p-4 rounded-lg border border-border shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-primary-dark">
              重要論点一覧 ({questions.length})
            </h3>
            {isLoadingQuestions ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-pulse-slow flex space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <div className="w-2 h-2 bg-primary rounded-full" />
                </div>
              </div>
            ) : questions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        見出し
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        重要論点
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        関連するproblem
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        作成日時
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        表示
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        イラストまとめ
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        論点まとめ
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        市民意見レポート
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {questions.map((question) => (
                      <tr
                        key={question._id}
                        className={`hover:bg-muted/50 cursor-pointer ${selectedQuestionId === question._id ? "bg-muted/30" : ""}`}
                        onClick={() => setSelectedQuestionId(question._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedQuestionId(question._id);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selectedQuestionId === question._id}
                      >
                        <td className="px-6 py-4 whitespace-normal text-sm text-foreground font-medium">
                          {question.tagLine}
                        </td>
                        <td className="px-6 py-4 whitespace-normal text-sm text-foreground">
                          {question.questionText}
                          {question.tags && question.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {question.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="border bg-primary-100 text-primary-800 rounded-full px-2 py-0.5 text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-normal text-sm text-muted-foreground">
                          {/* We would fetch related problems here in a real implementation */}
                          <span className="text-muted-foreground italic">
                            関連データは取得中...
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(question.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleVisibility();
                            }}
                            className="px-3 py-1 bg-success/20 text-success-foreground rounded-full text-xs font-medium"
                            type="button"
                          >
                            表示
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuestionId(question._id);
                              handleGenerateVisualReport();
                            }}
                            disabled={isGeneratingVisualReport}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
                            type="button"
                          >
                            {isGeneratingVisualReport &&
                            selectedQuestionId === question._id ? (
                              <span className="flex items-center">
                                <svg
                                  className="animate-spin -ml-1 mr-1 h-3 w-3"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  aria-label="読み込み中"
                                  role="img"
                                >
                                  <title>読み込み中</title>
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                生成中
                              </span>
                            ) : (
                              "更新する"
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateDebateAnalysis(question._id, e);
                            }}
                            disabled={isGeneratingDebateAnalysis[question._id]}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
                            type="button"
                          >
                            {isGeneratingDebateAnalysis[question._id] ? (
                              <span className="flex items-center">
                                <svg
                                  className="animate-spin -ml-1 mr-1 h-3 w-3"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  aria-label="読み込み中"
                                  role="img"
                                >
                                  <title>読み込み中</title>
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                生成中
                              </span>
                            ) : (
                              "更新する"
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateReport(question._id, e);
                            }}
                            disabled={isGeneratingReports[question._id]}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
                            type="button"
                          >
                            {isGeneratingReports[question._id] ? (
                              <span className="flex items-center">
                                <svg
                                  className="animate-spin -ml-1 mr-1 h-3 w-3"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  aria-label="読み込み中"
                                  role="img"
                                >
                                  <title>読み込み中</title>
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                生成中
                              </span>
                            ) : (
                              "更新する"
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <p>まだ重要論点が生成されていません</p>
                <p className="mt-2 text-xs">
                  上部の「生成する」ボタンから生成できます
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
};

export default ThemeForm;

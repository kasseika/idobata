/**
 * テーマ エクスポート/インポート コントローラー
 *
 * 目的: テーマとその全関連データのエクスポート・インポート API を提供する。
 *
 * エンドポイント:
 *   - GET  /api/themes/:themeId/export?includeLikes=false  テーマデータのエクスポート
 *   - POST /api/themes/import                              テーマデータのインポート
 *
 * 認証: 両エンドポイントとも protect + admin 必須
 */

import type { Request, Response } from "express";
import {
  ExportError,
  buildExportData,
} from "../services/themeExportService.js";
import { importThemeData } from "../services/themeImportService.js";
import {
  ExportValidationError,
  validateExportData,
} from "../types/themeExport.js";

/**
 * テーマデータをJSONファイルとしてエクスポートする
 *
 * @param req.params.themeId - エクスポート対象のテーマID
 * @param req.query.includeLikes - いいねデータを含めるか（"true" の場合のみ含める。デフォルト: false）
 * @returns 200: エクスポートJSON / 400: パラメータ不正 / 404: テーマ未発見 / 500: サーバーエラー
 */
export async function exportTheme(req: Request, res: Response): Promise<void> {
  const { themeId } = req.params;

  // themeId の存在チェック
  if (!themeId) {
    res.status(400).json({ error: "themeId が指定されていません" });
    return;
  }

  const includeLikes = req.query.includeLikes === "true";

  try {
    const result = await buildExportData(themeId, { includeLikes });

    if (result.isErr()) {
      const error = result.error;
      if (
        error instanceof ExportError &&
        error.message.includes("見つかりません")
      ) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "エクスポートに失敗しました" });
      return;
    }

    const exportData = result.value;
    const filename = `theme-export-${encodeURIComponent(exportData.theme.title)}-${Date.now()}.json`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(exportData);
  } catch (error) {
    res.status(500).json({ error: "テーマデータのエクスポートに失敗しました" });
  }
}

/**
 * テーマデータをインポートして新しいテーマを作成する
 *
 * @param req.body - ThemeExportData 形式のJSONデータ
 * @returns 201: 作成されたテーマ情報 + インポート統計 / 400: バリデーションエラー / 500: サーバーエラー
 */
export async function importTheme(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;

  // バリデーション
  const validationResult = validateExportData(body);
  if (validationResult.isErr()) {
    res.status(400).json({ error: validationResult.error.message });
    return;
  }

  const exportData = validationResult.value;

  try {
    const result = await importThemeData(exportData);

    if (result.isErr()) {
      const error = result.error;
      if (error instanceof ExportValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({
        error: "インポート処理に失敗しました。データはロールバックされました",
      });
      return;
    }

    res.status(201).json(result.value);
  } catch (error) {
    res.status(500).json({ error: "テーマデータのインポートに失敗しました" });
  }
}

import React from "react";
import { useEffect, useState } from "react";
import type { FC } from "react";
import { Link } from "react-router-dom";
import ThemeImportDialog from "../components/theme/ThemeImportDialog";
import ThemeTable from "../components/theme/ThemeTable";
import { Button } from "../components/ui/button";
import { apiClient } from "../services/api/apiClient";
import type { Theme, ThemeImportStats } from "../services/api/types";

const ThemeList: FC = () => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // インポートダイアログの状態
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importStats, setImportStats] = useState<ThemeImportStats | null>(null);

  const fetchThemes = async () => {
    setLoading(true);

    const result = await apiClient.getAllThemes();

    result.match(
      (data) => {
        setThemes(data);
        setError(null);
      },
      (fetchError) => {
        console.error("Failed to fetch themes:", fetchError);
        setError("テーマの取得に失敗しました。");
      }
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchThemes();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？")) {
      return;
    }

    const result = await apiClient.deleteTheme(id);

    result.match(
      () => {
        fetchThemes();
      },
      (deleteError) => {
        console.error("Failed to delete theme:", deleteError);
        alert("テーマの削除に失敗しました。");
      }
    );
  };

  const handleExport = async (id: string) => {
    const result = await apiClient.exportTheme(id);
    result.match(
      () => {
        // ダウンロードは apiClient 内部でトリガー済み
      },
      (exportError) => {
        console.error("Failed to export theme:", exportError);
        alert("テーマのエクスポートに失敗しました。");
      }
    );
  };

  const handleImport = async (exportData: unknown) => {
    setImportLoading(true);
    const result = await apiClient.importTheme(exportData);
    result.match(
      (stats) => {
        setImportStats(stats);
        // インポート成功後にテーマ一覧を更新
        fetchThemes();
      },
      (importError) => {
        console.error("Failed to import theme:", importError);
        alert("テーマのインポートに失敗しました。");
      }
    );
    setImportLoading(false);
  };

  const handleCloseImportDialog = () => {
    setShowImportDialog(false);
    setImportStats(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">テーマ一覧</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            テーマをインポート
          </Button>
          <Link to="/themes/new">
            <Button>新規テーマ作成</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4">読み込み中...</div>
      ) : error ? (
        <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>
      ) : (
        <ThemeTable
          themes={themes}
          onDelete={handleDelete}
          onExport={handleExport}
        />
      )}

      {showImportDialog && (
        <ThemeImportDialog
          onImport={handleImport}
          onClose={handleCloseImportDialog}
          isLoading={importLoading}
          importStats={importStats}
        />
      )}
    </div>
  );
};

export default ThemeList;

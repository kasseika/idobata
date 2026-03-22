"""
python-service メインモジュールのテスト

目的: クライアント初期化・モデルパラメータ受け渡しの正常動作を検証する。
注意: ChromaDB・外部API呼び出しはモックを使用する。
"""

import os
import pytest
from unittest.mock import MagicMock, patch


class TestClientInitialization:
    """OpenAIクライアント初期化のテスト。"""

    def test_ヘッダーにAPIキーがある場合_正しいbase_urlでクライアントが初期化される(self):
        """ヘッダーにAPIキーが指定された場合、OpenAIクライアントがOpenRouterのbase_urlで初期化されること。"""
        import sys
        if "app.main" in sys.modules:
            del sys.modules["app.main"]

        with patch("chromadb.PersistentClient"), \
             patch("openai.OpenAI") as mock_openai:
            import app.main  # noqa: F401
            mock_openai.reset_mock()
            app.main.get_openai_client("test-key-from-header")
            mock_openai.assert_called_once_with(
                base_url="https://openrouter.ai/api/v1",
                api_key="test-key-from-header",
            )
        if "app.main" in sys.modules:
            del sys.modules["app.main"]


@pytest.fixture
def loaded_main():
    """app.mainモジュールをモック環境でインポートして提供するフィクスチャ。"""
    import sys
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    with patch("chromadb.PersistentClient"), \
         patch("openai.OpenAI"):
        import app.main as m
        yield m
    if "app.main" in sys.modules:
        del sys.modules["app.main"]


class TestEmbeddingRequestModel:
    """EmbeddingRequestモデルのフィールドテスト。"""

    def test_EmbeddingRequest_にmodelフィールドが存在する(self, loaded_main):
        """EmbeddingRequestにmodelフィールドが存在し、デフォルト値がopenai/text-embedding-3-smallであること。"""
        request = loaded_main.EmbeddingRequest(items=[], collectionName="テスト用コレクション")
        assert request.model == "openai/text-embedding-3-small"

    def test_EmbeddingRequest_にカスタムmodelを指定できる(self, loaded_main):
        """EmbeddingRequestにカスタムモデルIDを指定できること。"""
        request = loaded_main.EmbeddingRequest(items=[], collectionName="テスト用コレクション", model="google/gemini-embedding-001")
        assert request.model == "google/gemini-embedding-001"

    def test_TransientEmbeddingRequest_にmodelフィールドが存在する(self, loaded_main):
        """TransientEmbeddingRequestにmodelフィールドが存在し、デフォルト値がopenai/text-embedding-3-smallであること。"""
        request = loaded_main.TransientEmbeddingRequest(text="テスト")
        assert request.model == "openai/text-embedding-3-small"


class TestGenerateEmbeddingsModel:
    """generate_embeddings関数のモデルパラメータテスト。"""

    @pytest.mark.asyncio
    async def test_generate_embeddings_がmodelパラメータをAPIに渡す(self):
        """generate_embeddings関数がmodelパラメータをOpenAI API呼び出しに使用すること。"""
        import sys
        if "app.main" in sys.modules:
            del sys.modules["app.main"]

        mock_client = MagicMock()
        mock_embedding = MagicMock()
        mock_embedding.embedding = [0.1, 0.2, 0.3]
        mock_response = MagicMock()
        mock_response.data = [mock_embedding]
        mock_client.embeddings.create.return_value = mock_response

        with patch("chromadb.PersistentClient"), \
             patch("openai.OpenAI", return_value=mock_client):
            import app.main as m

            result = await m.generate_embeddings(["テスト文字列"], model="google/gemini-embedding-001", api_key="test-key")

            mock_client.embeddings.create.assert_called_once()
            call_args = mock_client.embeddings.create.call_args
            actual_model = call_args.kwargs.get("model")
            if actual_model is None and call_args.args:
                actual_model = call_args.args[0]
            assert actual_model == "google/gemini-embedding-001"
            assert result == [[0.1, 0.2, 0.3]]

    @pytest.mark.asyncio
    async def test_generate_embeddings_のデフォルトmodelはopenai_text_embedding_3_small(self):
        """generate_embeddings関数のデフォルトモデルがopenai/text-embedding-3-smallであること。"""
        import sys
        if "app.main" in sys.modules:
            del sys.modules["app.main"]

        mock_client = MagicMock()
        mock_embedding = MagicMock()
        mock_embedding.embedding = [0.1, 0.2, 0.3]
        mock_response = MagicMock()
        mock_response.data = [mock_embedding]
        mock_client.embeddings.create.return_value = mock_response

        with patch("chromadb.PersistentClient"), \
             patch("openai.OpenAI", return_value=mock_client):
            import app.main as m

            await m.generate_embeddings(["テスト文字列"], api_key="test-key")

            call_kwargs = mock_client.embeddings.create.call_args.kwargs
            assert call_kwargs["model"] == "openai/text-embedding-3-small"

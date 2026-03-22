/**
 * Vitest セットアップファイル
 *
 * ReactのactAPIをテスト環境で正しく動作させるための設定。
 */
// React 18/19のact()警告を抑制するためのフラグ設定
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Vitest セットアップファイル
 *
 * ReactのactAPIをテスト環境で正しく動作させるための設定。
 */

// React 18/19のact()警告を抑制するためのフラグ設定
// declare globalはexport{}があるモジュールスコープでのみ使用可能
export {};

declare global {
  // React 18/19のact()がテスト環境を認識するためのフラグ
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

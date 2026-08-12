/**
 * Server Action呼び出し（`await xxxAction(...)`）がオフライン等でthrowした際に
 * 表示する共通のインラインエラーメッセージ。SRS 3.4「予期しないエラー発生時は
 * 汎用エラー画面を表示する」の各所での実装差分・文言ズレを防ぐため、Server Actionを
 * 呼ぶ各クライアントコンポーネントのcatch節から参照する（Phase 8）。
 */
export const NETWORK_ERROR_MESSAGE =
  "通信に失敗しました。オフラインの可能性があります。";

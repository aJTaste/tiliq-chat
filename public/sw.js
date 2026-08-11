// Phase 7: PWAインストール可能性のための最小構成Service Worker。
// レスポンスキャッシュ戦略は持たない（オフラインバナーはnavigator.onLineベースで別途対応）。
// 将来プッシュ通知の実配信に対応する場合は、ここに`push`/`notificationclick`イベントリスナーを
// 追加する形で拡張する（CLAUDE.md Phase 7参照）。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// fetchイベントのリスナー登録自体が「インストール可能なPWA」の判定条件の一つになるため、
// 何もしない実装であっても登録しておく。
self.addEventListener("fetch", () => {});

## Phase 7 の実装内容・詳細

SRS FR-24、3.2.1（アプリ設定画面・インストールプロンプト）、3.4（オフラインバナー）、2.2/2.4（PWAインストール対応）準拠。通知設定（プッシュ通知トグルのみ・実配信は対象外）とPWA仕上げ（Service Worker登録・オフラインバナー・インストール導線）を実装。デプロイは合意通り今回もスコープ外のまま。

### 追加ファイル

- `public/sw.js` — 最小構成のService Worker（`install`/`activate`/空の`fetch`のみ、キャッシュ戦略なし）。将来プッシュ通知の実配信に対応する際は`push`/`notificationclick`イベントリスナーをここに追加する拡張ポイントとして設計
- `components/pwa/ServiceWorkerRegistrar.tsx` — `useEffect`内でfeature detectionガード後に`navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`。何も描画しない
- `components/pwa/OfflineBanner.tsx` — SRS 3.4準拠。`components/auth/AuthGate.tsx`と同じSSR安全パターン（初期値`null`→`useEffect`で`navigator.onLine`を読み補正）。`online`/`offline`イベントで追従
- `components/pwa/InstallPrompt.tsx` — `beforeinstallprompt`のカスタムハンドリング＋iOSフォールバック案内。ファイル内に`BeforeInstallPromptEvent`のアンビエント型宣言（`WindowEventMap`拡張）を持つ（標準の`lib.dom.d.ts`に型が無いため、`any`を避けてこの方式にした）
- `components/settings/NotificationSettingsForm.tsx` — 通知設定（プッシュ通知トグル）・DM受信設定（知らない人からのDM、`StrangerDmToggle.tsx`から移植）の2セクション。`AuthSettingsForm.tsx`と同じ「即時`setState`→`startTransition`→失敗時ロールバック」パターン

### 変更ファイル

- `proxy.ts` — `matcher`の除外パターンに`sw\.js`を追加（後述「設計判断・学び」参照）
- `app/layout.tsx` — `<body>`内に`<ServiceWorkerRegistrar />` `<OfflineBanner />` `<InstallPrompt />`を追加
- `app/actions/settings.ts` — `updatePushNotificationsEnabled`を追加。`updateDmFromStrangerSetting`の`revalidatePath`を`/home`から`/settings`に変更（表示場所の移動に合わせる）
- `app/settings/page.tsx` — `user_settings`のSELECTに`dm_from_stranger_enabled, push_notifications_enabled`を追加し、`<NotificationSettingsForm>`を`<AuthSettingsForm>`の後に並置。SRS 3.2.1「アプリ設定画面（認証設定・通知設定・DM受信設定を含む）」に合致
- `app/home/page.tsx` — `StrangerDmToggle`のimport・使用箇所・関連state・SELECT列を削除
- `next.config.ts` — `headers()`を追加し`/sw.js`に`Cache-Control: no-cache, no-store, must-revalidate`を設定（Service Worker更新の確実な反映のため）

### 削除ファイル

- `components/home/StrangerDmToggle.tsx` — `NotificationSettingsForm.tsx`に統合されたため削除

### 設計判断・学び

- **`beforeinstallprompt`はNext.js公式ドキュメント（`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`）で「非推奨（Safari iOS非対応などクロスブラウザでない）」と明記されている。** 公式サンプルはこのイベントを使わず、ブラウザ標準のインストール導線（Chromiumのアドレスバーアイコン等）に任せる設計。今回は、SRS 2.2/2.4・3.2.1がPWAインストール対応・インストールプロンプトを明示的に要求していることを踏まえ、ユーザーに確認のうえ**あえてカスタムボタン＋iOSフォールバック案内を採用した**（Chromium系での能動的な導線を優先）。将来Next.jsのメジャーアップデートで`beforeinstallprompt`自体が廃止された場合は、`InstallPrompt.tsx`を公式サンプル相当のシンプル版（`isIOS`/`isStandalone`判定のみ）に差し替える想定
- **`proxy.ts`の`matcher`除外パターンに`sw.js`が入っておらず、そのままでは未ログイン状態でService Workerの登録が失敗する落とし穴があった。** `manifest.webmanifest`・`icon-*.png`は既に除外済みだったが`sw.js`だけ対象外のまま残っており、未ログイン画面（`/`・`/login`・`/signup`）で`register('/sw.js')`を呼ぶとproxyが`/login`へリダイレクトしてしまう（リダイレクトされたスクリプトはブラウザ仕様上Service Worker登録に失敗する）。同じパターンの見落としは今後別の静的ファイルを追加する際にも起こりうるため注意
- **`push_notifications_enabled`は今回DB保存のトグルのみ実装し、実際のプッシュ配信（Service Worker経由の購読管理・VAPID鍵・送信トリガー）は実装していない。** SRS FR-24「配置は実装時に決定」・3.4「プッシュ通知はベストエフォート」との整合。今回登録した`public/sw.js`に`push`イベントリスナーを追加する形で将来拡張できる
- **ESLintの`react-hooks/set-state-in-effect`ルールは、同一`useEffect`内で連続する複数の`setState`呼び出しのうち、最初の1件のみを検出する挙動だった。** `InstallPrompt.tsx`の`useEffect`（`setIsIOS`→`setIsStandalone`→`setDismissed`の3連続呼び出し）で実際に確認：`eslint-disable-next-line`を3行すべてに付けたところ、2件目以降が「Unused eslint-disable directive」警告になった。`AuthGate.tsx`のように単独の`setState`呼び出しだけの`useEffect`ではこの挙動差は表面化しないため、今後同様の複数`setState`を1つの`useEffect`にまとめる実装をする際は、実際に`npx eslint`を実行してdisableコメントの要否を確認すること（機械的に全行へ付けると警告が出る）
- **設定画面の統合（`StrangerDmToggle`→`NotificationSettingsForm`）は表示場所の変更のみで、DB側のRPC・RLS（FR-22のストレンジャーDMチェック含む）は変更していない。** 機能自体への影響はない想定（実機確認項目3で検証）

### 動作確認してほしい項目（実機確認用チェックリスト）

1. Chrome DevTools ApplicationタブでManifest・Service Workerの登録状況を確認する
2. Networkタブでオフラインに切り替え→画面上部にオフラインバナーが表示されること。再接続すると自動的に消えること
3. シークレットウィンドウ（未ログイン状態）で`/sw.js`に直接アクセスし、200が返ることを確認する（`/login`へリダイレクトされる、または404になる場合はproxy修正が効いていない）
4. Chromium系ブラウザ（Chrome/Edge）でインストールプロンプト（カスタムボタン）が画面上部に表示され、実際にクリックしてインストールできること。インストール後はバナーが自動的に消えること。閉じるボタン（×）を押すと以後表示されなくなること（`localStorage`）
5. iOS Safariで開いた場合、インストールボタンではなく「共有ボタンから追加」の案内テキストが表示されること（実機・シミュレータどちらでも可）
6. 設定画面（`/settings`）で「プッシュ通知」「知らない人からのDMを許可する」の2つのトグルを操作し、リロード後も値が保持されること
7. 「知らない人からのDMを許可する」をオフにした状態で、フレンドでない相手が新規DMを開始しようとすると、Phase 5実装時と同様にエラーになることを確認する（表示場所移動後も機能自体は変わっていないことの確認）
8. ホーム画面ヘッダーから「知らない人からのDM」トグルが無くなっていること（設定画面に移動済み）

### 実機テストで見つかったバグ（Phase 7完了後・未修正）

- **オフライン時にServer Action呼び出しが失敗すると、キャッチされない例外としてNext.jsのエラー画面が表示される。** `/settings`でプッシュ通知トグルをオフライン状態のまま操作した際に発覚（実機確認項目6の派生ケース）。
  - **原因：** [components/settings/NotificationSettingsForm.tsx](components/settings/NotificationSettingsForm.tsx)の`togglePush`/`toggleDmFromStranger`が`startTransition(async () => { const result = await xxxAction(next); if (!result.success) ... })`という形でServer Actionを`try/catch`なしで`await`している。この`if (!result.success)`によるロールバックは、サーバーまで到達してDB更新自体が失敗したケース（`ActionResult`が`{success:false}`を返す）しか想定しておらず、**サーバーへのリクエスト自体が届かないケース**（オフライン等）では`fetch`が`TypeError: Failed to fetch`を投げて`await`の行で例外が発生し、`if`文まで到達せず関数全体が異常終了する。この未処理の例外がNext.jsの開発用エラー画面としてそのまま表示された（本番ビルドでは別の壊れ方になる可能性が高い）。SRS 3.4「予期しないエラー発生時は汎用エラー画面を表示する」に反する
  - **同一パターンが既存コードにも波及している：** `components/settings/AuthSettingsForm.tsx`（`handleSubmit`/`handleClear`/`toggleScopeLaunch`/`toggleScopeHiddenList`）・`components/auth/AuthGate.tsx`（`handleSubmit`/`handleUnlockWithPassword`）もPhase 6実装時点から同じ書き方。オフライン時の動作確認はPhase 7のオフラインバナー実装で初めて行ったため、今まで顕在化していなかった
  - **対応方針（ユーザー確認済み）：** 今回は修正せず記録のみに留める。対応する場合は、各ハンドラの`await xxxAction(...)`を`try/catch`で囲み、`catch`節で楽観的更新をロールバックしつつ「通信に失敗しました。オフラインの可能性があります。」等のインラインエラーメッセージを表示する形に揃える（`AuthSettingsForm.tsx`は既に`error` stateを持つため流用しやすい。`NotificationSettingsForm.tsx`は`error` stateの追加が必要）
  - 対応する場合の範囲候補：①`/settings`画面3ファイル（`NotificationSettingsForm.tsx`・`AuthSettingsForm.tsx`・`AuthGate.tsx`）のみ、②アプリ全体のServer Action呼び出し箇所（`friends.ts`・`blocks.ts`・`rooms.ts`等の呼び出し元）を棚卸しして横断対応、のいずれか。次回セッションでユーザーと相談して決めること

### 未対応・持ち越し事項（Phase 7時点）

- 実際のプッシュ通知配信（購読管理・VAPID鍵・送信トリガー）は引き続き未実装
- Phase 6から持ち越しの棚卸し事項（`rooms.lock_type/lock_secret`未使用、既存RPCの`anon`実行権限、`AddUserPanel.tsx`の既存ESLintエラー3件）は今回も未対応のまま
- デプロイ（Vercel本番環境設定）は引き続きスコープ外。他の未実装機能（グループチャットUI等）が出揃ってから着手する方針は変更なし


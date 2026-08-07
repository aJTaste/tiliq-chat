@AGENTS.md

# Tiliqua — 開発コンテキスト

このファイルはセッション間で開発の文脈を引き継ぐためのものです。作業開始前に必ず目を通してください。

## プロジェクト概要

- **アプリ名：** Tiliqua（アオジタトカゲの学名。並び替えると "Qualiti" = quality）
- **リポジトリ名：** tiliq-chat（`tiliqua` の意図的な短縮。本人はこの略し方を他でも使用）
- **目的：** プライバシー重視・軽量設計のチャットアプリ。低スペック端末（学校PC含む）でも快適に動作し、広告なし・外部サービス連携なしで運用する
- **要件定義：** [`docs/srs.md`](./docs/srs.md) が正。仕様に迷ったら必ずこちらを参照する
- **開発体制：** コーディングは基本的にClaudeがすべて担当する。ユーザーはUIの確認・動作確認・意見出しを担当
- **開発環境：** Windows 11 / VS Code。パッケージ管理はnpm
- **会話の切り替え運用：** Claude利用制限を抑えるため、Phaseや作業のまとまりごとに会話を切り替える。区切りの良いところに達したら、会話が終わる前に必ずこのファイル（および必要ならメモリ）に進捗・次にやるべきことを反映すること

## 技術スタック（バージョン確定）

| 項目                  | バージョン                                                   |
| --------------------- | ------------------------------------------------------------ |
| Next.js               | 16.2.12（App Router）                                        |
| React                 | 19.2.4                                                       |
| Tailwind CSS          | 4.3.3（CSS-first設定、`@theme` を `app/globals.css` に記述） |
| TypeScript            | ^5                                                           |
| @supabase/ssr         | ^0.12.4                                                      |
| @supabase/supabase-js | ^2.112.0                                                     |
| Node.js               | 22系                                                         |
| パッケージ管理        | npm                                                          |

## Supabaseプロジェクト（Phase 1で作成）

| 項目           | 値                                         |
| -------------- | ------------------------------------------ |
| プロジェクト名 | `tiliq-chat`                               |
| project ref    | `xewprddypddcxkwvcytu`                     |
| リージョン     | ap-northeast-1（東京）                     |
| Project URL    | `https://xewprddypddcxkwvcytu.supabase.co` |
| 料金           | 無料プラン（月額0円）                      |

`.env.local` には以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://xewprddypddcxkwvcytu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_VIxVf8bWwth8Afc_ojKkug_FJdQknnz
SUPABASE_SERVICE_ROLE_KEY=（Supabaseダッシュボード → Project Settings → API Keysから手動取得。MCP経由では取得不可）
```

### Supabaseダッシュボードの注意点（新UI・2026年時点）

- 以前の「Database → Replication」ページは**物理レプリカ／分析パイプライン用**（Read replicas and analytics pipelines）に変わっている
- Realtimeのテーブル登録（`postgres_changes`購読の前提）は別メニューの **「Database → Publications」** から行う。`supabase_realtime` パブリケーションを開き、対象テーブルのトグルをON にする
- `supabase_realtime_messages_publication` という紛らわしい名前のパブリケーションが自動生成されているが、これはSupabase内部の `realtime.messages`（Presence/Broadcast用システムテーブル）向けであり、アプリの `public.messages` とは無関係。誤って触らないこと
- SQLで直接設定する場合：`alter publication supabase_realtime add table public.テーブル名;`

## Next.js 16 の破壊的変更（重要）

- **`middleware.ts` は廃止され `proxy.ts` になった。** エクスポート名は`proxy`（named export。default exportも可）。Phase 2で実装済み。実際にnpmパッケージ（next@16.2.12）のドキュメントを取得して仕様確認済み：`request.cookies` / `response.cookies` APIは旧middlewareと同一、デフォルトでNode.jsランタイム（Edgeランタイム限定ではない）
- **動的ルートの`params`はPromiseになった。** `app/chat/[roomId]/page.tsx` のようなServer Componentでは `params: Promise<{ roomId: string }>` として受け取り、`await params` で取り出す（Next 15で導入され、Next 16では同期アクセスがサポート外に）。`cookies()` が非同期なのと同じ設計思想
- **Cache Components（`cacheComponents: true`）は有効化していない**（デフォルトの動的レンダリングのまま）。理由：チャット・認証まわりはほぼ全てユーザー個別のデータで、静的キャッシュが馴染まないため

## デザイントークン（`app/globals.css`）

ブランドコンセプトは「地味な帯模様の体に、驚いたときだけ覗く鮮やかな青い舌」＝アオジタトカゲそのもの。ベースは落ち着いた石・帯模様のニュートラルカラー、アクセントの "tongue" ブルーだけを意図的に希少に使う。

| トークン           | 役割                                                       | Light     | Dark      |
| ------------------ | ---------------------------------------------------------- | --------- | --------- |
| `--surface`        | 背景                                                       | `#eae7dd` | `#1b1916` |
| `--surface-raised` | カード等の背景                                             | `#f5f3ec` | `#252220` |
| `--ink`            | 本文テキスト                                               | `#201d19` | `#ede8de` |
| `--ink-muted`      | 補助テキスト                                               | `#5c564c` | `#aba294` |
| `--band`           | 罫線・区切り                                               | `#c7bca3` | `#4a443b` |
| `--clay`           | 装飾アクセント（控えめに使用。エラーメッセージにも流用中） | `#8b4331` | `#c97a54` |
| `--tongue`         | シグネチャーカラー（CTA・リンク・強調に限定使用）          | `#2451c4` | `#6e93f0` |

ライト/ダークは `prefers-color-scheme` に自動追従（手動テーマ切替はSRS上も対象外＝Future Extensions）。

フォント：`--font-display`（Space Grotesk・見出し用）、`--font-body`（Inter・本文、`body`に既定適用）、`--font-label`（IBM Plex Mono・ラベルやメタ情報用）。

## 開発フェーズ

| Phase | 内容                                                                       | 状態     |
| ----- | -------------------------------------------------------------------------- | -------- |
| 0     | プロジェクト基盤（Next.js / Tailwind / PWA / アイコン / ブランドトークン） | **完了** |
| 1     | Supabaseプロジェクト設定・DBスキーマ（9テーブル）・RLS・トリガー           | **完了** |
| 2     | 認証フロー（サインアップ・ログイン・ログアウト・`proxy.ts`）               | **完了** |
| 3     | チャットのコア機能（Room・メッセージ送受信・Realtime・ページング）         | **完了** |
| 4     | 画像送信（Cloudinary連携）                                                 | 次はこれ |
| 5     | フレンド・ストレンジャー・ブロック機能                                     | 未着手   |
| 6     | 一時チャット・追加認証（PIN/キー）・非表示メッセージ                       | 未着手   |
| 7     | 通知設定・PWA仕上げ（Service Worker）・低スペック最適化・デプロイ          | 未着手   |

## Phase 1 の実装内容・詳細

DBスキーマは `docs/schema.sql` に全マイグレーション統合版を保存済み（実際の適用はSupabase側でmigration履歴として管理）。

### テーブル構成（9テーブル）

`profiles` / `user_settings` / `rooms` / `room_members` / `messages` / `message_hidden` / `friendships` / `blocks` / `temp_chat_sessions`

SRSの `User` モデルは `profiles`（公開情報）と `user_settings`（非公開情報）に分割。

### RLS設計の要点

- 全ポリシーは `to authenticated` のみに限定（`anon` は一切アクセス不可）
- `room_members` など自己参照的なRLSで無限再帰を避けるため、`is_room_member()` / `is_room_owner()` / `is_blocked()` を `SECURITY DEFINER` のヘルパー関数として切り出すパターンを採用
- 論理削除されたメッセージ（`deleted_at IS NOT NULL`）はRLSレベルで送信者・受信者どちらにも見せない
- メッセージ非表示（`message_hidden`）はRLSではなくアプリケーションクエリ側でフィルタする設計

### Phase 1で学んだ注意点

- **SECURITY DEFINER関数のRPC直接実行に注意：** `REVOKE ... FROM public` → `GRANT ... TO authenticated` で絞る
- **トリガー関数もEXECUTE権限を絞れる：** 認証トリガー専用の関数は`authenticated`/`anon`双方から`REVOKE EXECUTE`しても問題ない
- **RLSポリシーの `WITH CHECK (true)` はAdvisorに警告される：** `WITH CHECK (auth.uid() is not null)` のように明示的に書き換える
- **`get_advisors` の結果は数分キャッシュされることがある**

## Phase 2 の実装内容・詳細

### 追加パッケージ

`@supabase/ssr` / `@supabase/supabase-js`

### 追加ファイル

- `lib/supabase/client.ts` — ブラウザ用（`createBrowserClient`。cookiesオプションは省略可、document.cookie経由で自動処理される）
- `lib/supabase/server.ts` — Server Component / Server Action用（`createServerClient`。`cookies()`は非同期）
- `lib/supabase/admin.ts` — service_role用（RLSバイパス。`createUser`・重複チェックに使用）
- `proxy.ts` — セッションリフレッシュ＋ルート保護（未ログイン時は保護ルートで`/login`へ、ログイン済みで`/login`・`/signup`にアクセスすると`/home`へ）
- `app/actions/auth.ts` — `signup` / `login` / `logout` のServer Actions
- `app/login/page.tsx` / `app/signup/page.tsx` — フォーム画面（`useActionState`使用）
- `app/home/page.tsx` — 認証確認用の仮画面（**Phase 3で実際のチャット一覧画面に置き換え済み**）

### 設計判断・学び

- **`@supabase/ssr`は`get`/`set`/`remove`が非推奨化されており、`getAll`/`setAll`パターンが正。** 古いSupabaseチュートリアルのコードをそのまま使うと警告が出るので注意
- **ログインはユーザーID or 登録済み実メールアドレスの両方を受け付ける。** 実メールの場合は`user_settings.email` → `profiles.username`をadminクライアントで逆引きし、内部ドメインメール（`{username}@tiliqua.app`）に変換してから`signInWithPassword`を呼ぶ
- **サインアップ時のユーザーID重複チェックはadminクライアント（service_role）で実施。** `profiles`のRLSは`to authenticated`のみのため、未認証状態（サインアップ前）では読めないため
- **パスワードは最低8文字。** SRSに複雑さ要件の明記が無いための暫定値（必要なら変更可能）
- Server Actionsを採用（Route Handlerではなく）。App Router公式ドキュメントでもフォーム認証にはServer Actions + `useActionState`が推奨パターン

## Phase 3 の実装内容・詳細

### 追加ファイル

- `types/supabase.ts` — Supabase MCPの`generate_typescript_types`で生成した型定義。テーブル・RPC関数の型を含む
- `lib/supabase/client.ts` / `server.ts` / `admin.ts` — `Database`ジェネリクスを適用（型チェック・補完が効くように）
- `app/actions/rooms.ts` — DM開始のServer Action（`startDirectMessage`）。ユーザーID検索 → `get_or_create_dm_room` RPC呼び出し → `/chat/[roomId]`へリダイレクト
- `components/chat/NewDmForm.tsx` — DM開始フォーム（`useActionState`）
- `app/home/page.tsx` — チャット一覧画面に置き換え。自分が参加するDMルームを直近メッセージ順に表示
- `app/chat/[roomId]/page.tsx` — チャット画面のServer Component。メンバーシップ確認・相手プロフィール取得・直近30件のメッセージ取得
- `components/chat/ChatRoom.tsx` — チャット画面のClient Component。メッセージ送受信・Realtime購読・ページング・textarea自動リサイズ
- `components/chat/MessageBubble.tsx` — メッセージ1件分の表示

### DB変更

- RPC関数 `get_or_create_dm_room(p_other_user_id uuid) returns uuid` を追加（`docs/schema.sql`に追記済み）。`rooms` + `room_members`への複数INSERTをアトミックに行い、既存DMがあればそれを返す（重複ルーム防止）。他のヘルパー関数と同じくSECURITY DEFINER + `authenticated`のみEXECUTE許可のパターン
- `messages`テーブルを`supabase_realtime`パブリケーションに追加（`alter publication supabase_realtime add table public.messages;`）。**これを忘れるとRealtimeが届かない**（DBへの保存自体は成功するため気づきにくい不具合になる）

### 設計判断・学び

- **型生成はマイグレーション適用の「後」に行う。** 先に型生成してからRPC関数を追加すると、その関数の型（`Args`/`Returns`）が型定義に反映されない
- **DM作成はDB関数（RPC）にまとめてアトミックにした。** `rooms`→`room_members`(自分)→`room_members`(相手)を JSクライアント側で順にINSERTする方式も可能だが、途中失敗での中途半端なルーム残留や、同時押しでの重複DMルーム生成を避けるため
- **ホットパスの実践：** メッセージ送信・ページング取得はRoute Handlerを経由せず、Client ComponentからSupabaseクライアントを直接呼び出し（`lib/supabase/client.ts`）。既存原則どおり
- **Realtimeの購読ライフサイクル：** チャット画面マウント時に`postgres_changes`（`room_id`でフィルタしたINSERT）を購読し、アンマウント時に`removeChannel`で解除（SRS 3.6要件）
- **重複防止：** 自分の送信は「insert成功時のstate追加」と「Realtime受信」の両方から来る可能性があるため、メッセージ`id`で重複排除している
- **ページングはカーソルベース（`created_at`）。** 古いメッセージを先頭に追加した直後は`scrollHeight`の差分でスクロール位置を補正し、ジャンプを防いでいる
- **textareaの自動リサイズ：** `useLayoutEffect`で`height: auto` → `scrollHeight`を測り直すパターン。`max-h-32`で上限を設け、それ以上は内部スクロールに切り替える
- **コード配布方法の教訓：** ジェネリクスやJSXなど`<`を含む長いTS/TSXコードをチャットのコードブロックとして提示すると、ブラウザからのコピー＆ペースト時に`<`が欠落し構文エラーになった実例があった（`types/supabase.ts`、`app/home/page.tsx`）。以後、こうしたファイルは`create_file`でサンドボックス内に生成し、可能な限り実際に`tsc --noEmit`で検証してからダウンロード形式で渡す運用にした
- **Supabaseダッシュボードの新UI：** 上記「Supabaseプロジェクト」セクションに記載の注意点を参照

### 動作確認結果

ユーザーが実機で確認済み：DM開始（新規作成・既存ルームへの再利用・自分自身/存在しないユーザーIDへのエラーハンドリング）、メッセージ送受信、2画面でのRealtime反映、ページング（スクロール位置維持含む）、非メンバーからのアクセスで404、未ログイン時のリダイレクト、すべて正常動作。

### 未対応・持ち越し事項

- ルーム一覧（`app/home/page.tsx`の`fetchRoomList`）のクエリがN+1気味。Phase 5でフレンド機能を実装する際に、ビュー化またはRPC化を検討する
- メッセージ削除・非表示機能は未実装（DBの`deleted_at`カラム・`message_hidden`テーブルは用意済み。UIはPhase 6予定）
- 真の楽観的更新（送信直後に仮IDで即座に表示→サーバー確定後に差し替え）は未実装。現状はinsert完了（ネットワーク往復）を待ってからstateに反映している。低スペック端末・低速回線での体感速度に問題が出るようなら見直す
- グループチャットのUIは未対応。`app/chat/[roomId]/page.tsx`は「DM相手1人」を前提にした実装になっている
- `message.image_url`の表示は`<img>`タグで暫定対応済みだが、実際のアップロード機能はPhase 4で実装

## 開発上の重要な原則

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する
- **MXバイパス：** `signUp()`は使わず`adminClient.auth.admin.createUser()` + `email_confirm: true`を使う
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`を忘れずに実行する
- **トリガーの`search_path`：** authスキーマ配下から実行されるトリガー関数は`SET search_path = public`が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せずSupabaseクライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する
- **Realtime対象テーブルの登録を忘れない：** 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れずに行う（Supabaseダッシュボードの注意点セクション参照）
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する。ジェネリクス・JSXなど`<`を含む長いコードはチャットのコードブロックではなくファイルとして渡す
- **コミット：** Conventional Commits形式でコミットする
- **破壊的変更の確認：** Next.js等のバージョン依存の仕様に不安がある場合、AGENTS.mdの指示通り実物のドキュメント（npmパッケージから取得可能）またはWeb検索で確認してからコードを書く

## ファイル構成（現時点）

```
tiliq-chat/
├── app/
│   ├── layout.tsx              # フォント・メタデータ・PWA設定
│   ├── page.tsx                 # アプリ紹介ページ（SRS 3.2.1）
│   ├── globals.css              # デザイントークン・Tailwind v4設定
│   ├── favicon.ico
│   ├── login/page.tsx           # ログイン画面（Phase 2）
│   ├── signup/page.tsx          # サインアップ画面（Phase 2）
│   ├── home/page.tsx            # チャット一覧画面（Phase 3で置き換え）
│   ├── chat/[roomId]/page.tsx   # チャット画面（Phase 3）
│   └── actions/
│       ├── auth.ts              # signup/login/logout Server Actions（Phase 2）
│       └── rooms.ts             # startDirectMessage Server Action（Phase 3）
├── lib/
│   └── supabase/
│       ├── client.ts            # ブラウザ用クライアント（Phase 3でDatabase型適用）
│       ├── server.ts            # Server Component/Action用クライアント（Phase 3でDatabase型適用）
│       └── admin.ts             # service_role用クライアント（Phase 3でDatabase型適用）
├── components/
│   ├── TiliquaMark.tsx          # ブランドロゴ
│   └── chat/
│       ├── ChatRoom.tsx         # チャット画面本体・Realtime購読（Phase 3）
│       ├── MessageBubble.tsx    # メッセージ表示（Phase 3）
│       └── NewDmForm.tsx        # DM開始フォーム（Phase 3）
├── types/
│   └── supabase.ts              # Supabase生成型定義（Phase 3）
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
├── docs/
│   ├── srs.md                   # 要件定義（正）
│   └── schema.sql               # DBスキーマ参照用ファイル
├── proxy.ts                     # ルート保護・セッションリフレッシュ（Phase 2）
├── .env.example
└── CLAUDE.md（このファイル）
```

## 次にやること（Phase 4）

画像送信（Cloudinary連携）。SRS FR-7/FR-8、3.5「画像データ」を参照。

1. `.env.local`にCloudinaryの認証情報を設定（`.env.example`に項目は用意済み：`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`）
2. 署名付きアップロードの実装。アップロードは特権操作寄り（APIシークレットを使う）なので、Route Handler経由にする（既存原則の「Route Handlerは認証・特権操作専用」に合致）
3. クライアント側での画像圧縮・リサイズ（アップロード前。SRS 2.5「軽量・高速設計」の方針に沿う）。上限5MB・対応フォーマットJPEG/PNG/WebP/GIFのバリデーション
4. `components/chat/ChatRoom.tsx`の送信フォームに画像添付UIを追加。アップロード中の状態表示、失敗時のリトライ（SRS 3.4のエラーハンドリング要件）
5. `MessageBubble.tsx`の画像表示を、`next.config.ts`で許可済みの`res.cloudinary.com`を使い`next/image`に切り替え検討（現状は暫定で`<img>`タグ）
6. アカウント作成フォーム（`app/signup/page.tsx`）から外してあるアバターアップロードも、この段階で対応するか検討（Phase 2の持ち越し事項）

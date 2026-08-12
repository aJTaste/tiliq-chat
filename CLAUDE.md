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

## アカウント運用（2026年8月〜）

2026年8月、Claude Proのゲストパス（友人からの紹介リンク）を誤って新規のClaudeアカウントでredeemしてしまったことをきっかけに、以下の2アカウント体制で開発を進めることになった。

- **メインアカウント：** 本来Pro/Claude Codeを使う予定だった、これまで開発してきたアカウント。以後もこちらを主として開発を進める
- **サブアカウント：** ゲストパスを誤ってredeemしてしまった新規アカウント。メインアカウントが利用制限に達した場合の予備として使う

**運用ルール：**

- 基本はメインアカウントのClaude Codeで開発を進める。メインアカウントが利用制限（レート制限等）に達した場合のみサブアカウントに切り替える
- 両アカウントは同じローカルリポジトリ（WSL内`tiliq-chat`）を操作するため、アカウントを切り替える際は必ず`git pull`で最新化してから作業を始め、作業単位ごとに`commit`・`push`する
- 同時に両アカウントで並行編集しない（コンフリクト防止）
- サブアカウント側のClaude Projectには、このCLAUDE.mdの要約と経緯をまとめた引き継ぎメッセージを別途設定済み

## 技術スタック（バージョン確定）

| 項目                  | バージョン                                                   |
| --------------------- | ------------------------------------------------------------ |
| Next.js               | 16.3.0（App Router。Phase 11で16.2.12から更新）              |
| React                 | 19.2.8（Phase 11で19.2.4から更新）                           |
| Tailwind CSS          | 4.3.3（CSS-first設定、`@theme` を `app/globals.css` に記述） |
| TypeScript            | ~6.0.3（Phase 12で^5から更新。7系ではなく6.0系止まりである理由は「Phase 12 の実装内容・詳細」参照） |
| @supabase/ssr         | ^0.12.4                                                      |
| @supabase/supabase-js | ^2.112.3（Phase 11で^2.112.0から更新）                       |
| Node.js               | 22系（`@types/node`もPhase 11で`^20`→`^22`に修正）           |
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

# Phase 4で追加。Cloudinaryダッシュボード（Settings → API Keys）から取得
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### Supabaseダッシュボードの注意点（新UI・2026年時点）

- 以前の「Database → Replication」ページは**物理レプリカ／分析パイプライン用**（Read replicas and analytics pipelines）に変わっている
- Realtimeのテーブル登録（`postgres_changes`購読の前提）は別メニューの **「Database → Publications」** から行う。`supabase_realtime` パブリケーションを開き、対象テーブルのトグルをON にする
- `supabase_realtime_messages_publication` という紛らわしい名前のパブリケーションが自動生成されているが、これはSupabase内部の `realtime.messages`（Presence/Broadcast用システムテーブル）向けであり、アプリの `public.messages` とは無関係。誤って触らないこと
- SQLで直接設定する場合：`alter publication supabase_realtime add table public.テーブル名;`

## Next.js 16 の破壊的変更（重要）

- **`middleware.ts` は廃止され `proxy.ts` になった。** エクスポート名は`proxy`（named export。default exportも可）。Phase 2で実装済み。実際にnpmパッケージ（next@16.2.12）のドキュメントを取得して仕様確認済み：`request.cookies` / `response.cookies` APIは旧middlewareと同一、デフォルトでNode.jsランタイム（Edgeランタイム限定ではない）
- **動的ルートの`params`はPromiseになった。** `app/chat/[roomId]/page.tsx` のようなServer Componentでは `params: Promise<{ roomId: string }>` として受け取り、`await params` で取り出す（Next 15で導入され、Next 16では同期アクセスがサポート外に）。`cookies()` が非同期なのと同じ設計思想
- **Route Handler（`app/api/.../route.ts`）自体のシグネチャは変更なし。** `export async function POST(request: Request)` のまま（Phase 4でnode_modules/next/dist/docs/を実際に確認済み）。動的セグメントを持たないRoute Handlerでは`params`の扱いも関係ない
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
| 4     | 画像送信（Cloudinary連携）                                                 | **完了** |
| 5     | フレンド・ストレンジャー・ブロック                                         | **完了** |
| 6     | 一時チャット・追加認証・非表示メッセージ                                   | **完了** |
| 7     | 通知設定・PWA仕上げ（デプロイは対象外）                                    | **完了** |
| 8     | 地固め（バグ修正・技術的負債の解消・小粒UX修正）                           | **完了** |
| 9     | SRS未実装の中規模項目（汎用エラー画面・チャット内検索・レスポンシブ配置・キーボードアクセシビリティ） | **完了** |
| 10    | フレンド申請/解除のRealtime購読コード                                     | **完了** |
| 11    | 依存パッケージのバージョン更新                                             | **完了** |
| 12    | 依存パッケージのメジャー更新（typescript）                                | **完了** |
| 13    | ユーザー追加パネルをPCで常時展開に変更（Phase 9持ち越し事項の仕上げ）      | **完了** |

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
- `app/home/page.tsx` — 認証確認用の仮画面（**Phase 3で実際のチャット一覧画面に置き換え済み。Phase 5でさらにタブ構成へ拡張**）

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
- `components/chat/NewDmForm.tsx` — DM開始フォーム（`useActionState`）**※Phase 5で`AddUserPanel`に統合され削除**
- `app/home/page.tsx` — チャット一覧画面に置き換え。自分が参加するDMルームを直近メッセージ順に表示
- `app/chat/[roomId]/page.tsx` — チャット画面のServer Component。メンバーシップ確認・相手プロフィール取得・直近30件のメッセージ取得
- `components/chat/ChatRoom.tsx` — チャット画面のClient Component。メッセージ送受信・Realtime購読・ページング・textarea自動リサイズ（**Phase 4で画像添付機能、Phase 5でブロックUIを追加**）
- `components/chat/MessageBubble.tsx` — メッセージ1件分の表示（**Phase 4でCloudinary配信URL対応**）

### DB変更

- RPC関数 `get_or_create_dm_room(p_other_user_id uuid) returns uuid` を追加（`docs/schema.sql`に追記済み）。`rooms` + `room_members`への複数INSERTをアトミックに行い、既存DMがあればそれを返す（重複ルーム防止）。他のヘルパー関数と同じくSECURITY DEFINER + `authenticated`のみEXECUTE許可のパターン（**Phase 5でFR-22のストレンジャーDMチェックを追加**）
- `messages`テーブルを`supabase_realtime`パブリケーションに追加（`alter publication supabase_realtime add table public.messages;`）。**これを忘れるとRealtimeが届かない**（DBへの保存自体は成功するため気づきにくい不具合になる）

### 設計判断・学び

- **型生成はマイグレーション適用の「後」に行う。** 先に型生成してからRPC関数を追加すると、その関数の型（`Args`/`Returns`）が型定義に反映されない
- **DM作成はDB関数（RPC）にまとめてアトミックにした。**
- **ホットパスの実践：** メッセージ送信・ページング取得はRoute Handlerを経由せず、Client ComponentからSupabaseクライアントを直接呼び出し（`lib/supabase/client.ts`）
- **Realtimeの購読ライフサイクル：** チャット画面マウント時に`postgres_changes`（`room_id`でフィルタしたINSERT）を購読し、アンマウント時に`removeChannel`で解除（SRS 3.6要件）
- **重複防止：** 自分の送信は「insert成功時のstate追加」と「Realtime受信」の両方から来る可能性があるため、メッセージ`id`で重複排除している
- **ページングはカーソルベース（`created_at`）。** 古いメッセージを先頭に追加した直後は`scrollHeight`の差分でスクロール位置を補正
- **コード配布方法の教訓：** ジェネリクスやJSXなど`<`を含む長いTS/TSXコードをチャットのコードブロックとして提示すると、ブラウザからのコピー＆ペースト時に`<`が欠落し構文エラーになった実例があった。以後、こうしたファイルは`create_file`でサンドボックス内に生成し、可能な限り実際に`tsc --noEmit`で検証してからダウンロード形式で渡す運用にした

### 未対応・持ち越し事項（Phase 3時点）

- ルーム一覧（`app/home/page.tsx`の`fetchRoomList`）のクエリがN+1気味。**→ Phase 5で`get_conversation_list` RPCへ置き換えて解消済み**
- メッセージ削除・非表示機能は未実装（DBの`deleted_at`カラム・`message_hidden`テーブルは用意済み。UIはPhase 6予定）
- 真の楽観的更新は未実装。現状はinsert完了（ネットワーク往復）を待ってからstateに反映している
- グループチャットのUIは未対応。`app/chat/[roomId]/page.tsx`は「DM相手1人」を前提

## Phase 4 の実装内容・詳細

SRS FR-7/FR-8、3.5「画像データ」準拠。画像送信・閲覧機能を実装。

### 追加ファイル

- `lib/cloudinary/sign.ts` — Cloudinary署名付きアップロード用のシグネチャ生成（`node:crypto`のSHA1）。サーバー専用
- `app/api/cloudinary/sign/route.ts` — 署名発行のRoute Handler（POST）。ログイン確認＋対象ルームのメンバーシップ確認（`is_room_member` RPC）を行ってから、`timestamp`/`folder`に対する署名を返す
- `lib/cloudinary/upload.ts` — クライアント側から署名を取得し、Cloudinaryへ直接（Route Handlerを経由せず）アップロードする関数
- `lib/cloudinary/url.ts` — 表示用に`f_auto,q_auto,w_{width}`変換をCloudinaryのURLへ差し込むヘルパー
- `lib/images/compress.ts` — 送信前のバリデーション（形式・5MB上限）とcanvasベースのリサイズ・再圧縮
- `components/chat/ChatRoom.tsx` — 画像添付ボタン・プレビュー・アップロード状態表示・送信フローを追加（既存の完全なファイルを更新）
- `components/chat/MessageBubble.tsx` — 画像表示を`buildChatImageUrl`経由のCloudinary最適化URLに変更（既存の完全なファイルを更新）

### 設計判断・学び

- **アップロードはブラウザ→Cloudinaryへ直接（署名付き）。** Route Handlerは`CLOUDINARY_API_SECRET`を使う署名生成のみを担当し、画像本体はRoute Handlerを経由させない。理由：Vercelのサーバーレス関数にバイナリを中継させるとリクエストボディ上限・実行時間の制約に引っかかりやすく、無料プラン運用（SRS 2.5）と相性が悪いため。「Route Handlerは認証・特権操作専用」という既存原則にも合致する
- **署名対象パラメータは`folder`と`timestamp`のみ。** Cloudinaryの署名アルゴリズム（キー昇順ソート→`key=value`を`&`連結→`api_secret`を末尾に連結→SHA1）に準拠。`api_key`・ファイル本体は署名対象に含めない
- **フォルダは`tiliqua/rooms/{roomId}`単位。** 将来のFuture Extensions「Cloudinary画像の孤立ファイル削除バッチ」で、ルーム削除時にフォルダごと削除しやすくするため
- **署名発行時にルームメンバーシップを確認する多層防御。** 実際のメッセージINSERT自体はDB側RLS（`messages_insert_member_not_blocked`）で保護されているが、フォルダパスの正当性のためRoute Handler側でも`is_room_member` RPCを呼んでいる
- **next/image（Vercelの画像最適化API）は採用しなかった。** CloudinaryのURLに`f_auto,q_auto`を付与するだけで形式・画質の最適化ができるため、next/imageを併用すると同じ画像を二重に変換することになり、Vercel無料プランの画像最適化回数（月間上限あり）を無駄に消費してしまう。そのため配信は素の`<img>`のままとし、`lib/cloudinary/url.ts`でURLベースの変換だけを行う方針にした
- **GIFはcanvas再圧縮をスキップ。** canvas経由で再エンコードするとアニメーションが失われ1コマの静止画になってしまうため、GIFのみバリデーション（5MB上限・形式）だけ通して元ファイルをそのままアップロードする
- **アップロード進捗は%表示ではなく状態文言のみ（「画像を処理中...」「アップロード中...」）。** `fetch`ベースでシンプルに実装し、進捗%が必要になった場合はXHR（`upload.onprogress`）への切り替えを検討する
- **画像アップロード失敗時は自動リトライせず、選択中のファイル・本文をどちらも保持したまま手動再送信できるようにした。** SRS 3.4「画像アップロード失敗時は失敗メッセージを表示し、再送信を促す」に対応。テキストのみの送信失敗時の自動リトライ（最大3回）はSRS 3.4に別途記載があるが、Phase 4のスコープ外として未実装のまま（持ち越し事項に記載）
- **Route Handlerのシグネチャ自体はNext.js 16でも不変であることを実物のドキュメント（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`）で確認済み。** `app/api/cloudinary/sign/route.ts`に動的セグメントは無いため、`params`のPromise化も関係ない

### 実機テストで見つかったバグと修正（Phase 4完了後）

1. **GIFが送受信できない（表示が空に見える）**
   原因：`lib/cloudinary/url.ts`の表示用変換で、全画像に`f_auto,q_auto,w_{width}`を一律適用していた。Cloudinaryはアニメーション画像に変換をかける際、`fl_animated`フラグを付けない限り**デフォルトで先頭フレームのみ**を配信する仕様があり、多くのGIFは先頭フレームが空白/透明であることが多いため「何も表示されない」ように見えていた。
   修正：URLが`.gif`で終わる場合のみ`f_auto,fl_animated,q_auto,w_{width}`を適用するよう`buildChatImageUrl`を変更。

2. **新着メッセージ受信時、画面が最新の状態までスクロールされない（少し上で止まる）**
   原因：`setMessages(...)`の直後に同期で`bottomRef.current?.scrollIntoView()`を呼んでいたが、Reactの状態更新はDOMへの反映が次のコミットまで非同期のため、その時点ではまだ新しいメッセージがDOMに挿入されていなかった。
   修正：`pendingScrollToBottomRef`（bool）を新設し、実際のスクロールは`messages`の更新を検知する`useLayoutEffect`側（＝DOMへのコミット後）で行うことで、常に正しい最下部へ届くようにした。

3. **過去メッセージを読んでいる最中でも、新着メッセージが来ると強制的に最下部へスクロールされてしまう**
   対応：`isScrolledNearBottom()`を追加し、Realtime受信時のみ、新メッセージがDOMに追加される前の時点でこの判定を行い、最下部付近にいた場合だけ`pendingScrollToBottomRef`を立てるようにした。自分がメッセージを送信したときは、閲覧中のスクロール位置に関わらず常に最下部へ移動する（意図的な非対称設計）。

### 未対応・持ち越し事項（Phase 4時点）

- サインアップ画面（`app/signup/page.tsx`）のアバターアップロードは今回は対応せず。必要になったタイミングで`lib/cloudinary`の署名フローを流用して追加する
- アップロード進捗の%表示（現状は状態文言のみ）
- テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）は未実装
- 画像のみのメッセージに対する`MessageHidden`（非表示）・削除機能はPhase 6で対応予定

## Phase 5 の実装内容・詳細

SRS FR-11〜FR-13、FR-15、FR-22、FR-23 準拠。フレンド申請・フレンド/ストレンジャー一覧・ユーザー追加・ブロック・知らない人からのDM受信設定を実装。

### DB変更（`docs/schema.sql` に追記済み。実際の適用はSupabase MCP `apply_migration` "phase5_friends_strangers_blocking"）

新規RPC関数（すべて`SECURITY DEFINER` + `REVOKE FROM public` → `GRANT TO authenticated`の既存パターンを踏襲）：

| 関数                                    | 用途                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `get_conversation_list()`               | フレンド/ストレンジャー一覧用。DMルーム×相手プロフィール×フレンド状態×直近メッセージを1クエリで返す |
| `search_users(p_query text)`            | ユーザー追加UIの検索（username部分一致）。フレンド状態・既存DM roomIdも同時に返す                   |
| `get_friend_requests()`                 | 送受信中・直近拒否のフレンド申請一覧（受信=承認拒否UI、送信=簡易通知用）                            |
| `send_friend_request(p_addressee_id)`   | フレンド申請送信。拒否済みの同方向リクエストは`pending`へ差し戻して再利用                           |
| `respond_to_friend_request(id, accept)` | 受信した申請の承認・拒否                                                                            |
| `cancel_friend_request(id)`             | 自分が送った申請中リクエストの取り消し                                                              |
| `remove_friend(p_other_user_id)`        | フレンド解除                                                                                        |
| `mark_friend_requests_read()`           | 受信申請の既読化（ユーザー追加パネルを開いた時に呼ぶ）                                              |
| `block_user(p_target_id)`               | ブロック登録＋既存フレンド関係の解消                                                                |

既存関数の更新：

- **`get_or_create_dm_room`**：新規DM作成時のみ、フレンド関係が無い場合に相手の`dm_from_stranger_enabled`（FR-22）をチェックし、falseならエラー（`does not accept DMs from strangers`）を返すよう変更。既存DM・フレンド同士は従来通りチェック無し

### 追加ファイル

- `app/actions/friends.ts` — フレンド申請の送信・承認・拒否・取り消し・解除・既読化のServer Actions
- `app/actions/blocks.ts` — ブロック・ブロック解除のServer Actions（解除はRLS `blocks_delete_own` を使い直接テーブル操作、それ以外はRPC経由）
- `app/actions/settings.ts` — `dm_from_stranger_enabled`トグル用Server Action
- `components/home/HomeTabs.tsx` — 「フレンド／ストレンジャー／グループ」タブ（クライアント側で`friendship_status`によりフィルタ）。グループは未実装のためプレースホルダー表示
- `components/home/AddUserPanel.tsx` — ユーザー追加UI（FR-15）。開閉式パネルに検索・フレンド申請送信/承認/拒否/取り消し・簡易ブロックを集約。検索はブラウザから`search_users` RPCを直接呼ぶ（デバウンス300ms）
- `components/home/StrangerDmToggle.tsx` — FR-22のトグル（ホーム画面ヘッダーに暫定配置）

### 変更ファイル

- `app/home/page.tsx` — Phase 3の`fetchRoomList`（N+1気味の複数クエリ、持ち越し事項として記録していたもの）を`get_conversation_list` RPCへ完全に置き換え。`get_friend_requests`・`user_settings.dm_from_stranger_enabled`も並列取得し、`AddUserPanel`・`HomeTabs`・`StrangerDmToggle`へ渡す
- `app/actions/rooms.ts` — `startDirectMessageWithUser(userId)`を追加（検索結果など、既にuser_idが分かっているUIから使う）。エラーメッセージを`mapDmError`でユーザー向け日本語に変換（ストレンジャーDM拒否・ブロックの2パターンを判別）
- `app/chat/[roomId]/page.tsx` — `blocks`テーブルから「自分が相手をブロックしているか」を取得し`ChatRoom`へ`initialIsBlockedByMe`として渡す
- `components/chat/ChatRoom.tsx` — ヘッダーにブロック/ブロック解除ボタンを追加。ブロック中はメッセージ入力・画像添付を無効化
- `types/supabase.ts` — Supabase MCPの`generate_typescript_types`で再生成（Phase 5のRPC関数を反映）

### 削除ファイル

- `components/chat/NewDmForm.tsx` — `AddUserPanel`に統合されたため削除（リポジトリから手動で削除してください）

### 設計判断・学び

- **ホーム画面の「検索」タブは独立させず、ユーザー追加パネル（`AddUserPanel`）に統合した。** SRS 3.2.1では「フレンド・ストレンジャー・グループ・検索」の4タブ構成だが、「検索＝ユーザー追加」と「フレンド申請の管理」は同じ文脈の操作なので1つの開閉パネルにまとめた方が自然と判断。`docs/srs.md`本文の更新は未実施（必要なら次のセッションで反映を検討）
- **グループチャットタブはプレースホルダーのみ。** グループチャットUI（FR-4）はどのPhaseにも未割り当てのままのため、`HomeTabs`にタブ自体は用意しつつ`disabled`にして「準備中」を表示するに留めた
- **フレンド申請の「拒否」は行を削除せず`status='rejected'`のまま残す設計にした。** 削除してしまうと申請者側が拒否されたことを知る手段が無くなる（SRS FR-11の「拒否の結果を申請者に通知」に反する）ため。再申請時は同方向なら既存行を`pending`に差し戻し、逆方向なら新規行を作成する（`unique(requester_id, addressee_id)`制約はタプル単位のため衝突しない）
- **ブロック時に既存のフレンド関係も解消する仕様にした（`block_user`関数内でDELETE）。** SRSに明記は無いが、ブロックした相手とフレンド関係が残ったままなのは直感に反するため。逆にブロック解除してもフレンド関係は自動復元しない（再度フレンド申請が必要）
- **「ストレンジャー」の定義をやや緩めて解釈した。** SRSの定義は「過去に1度以上メッセージのやりとりがあるユーザー」だが、`get_conversation_list`はDMルームが存在する時点で一覧に含める（メッセージ0件でも表示）。理由：DMを開始した直後にリストから消えてしまうと使い勝手が悪いため。この定義の違いは検索対象（SRS 3.5）には適用しておらず、あくまでホーム画面の会話一覧の話
- **`get_conversation_list`・`search_users`はブロック関係（双方向）にあるユーザーとの会話・検索結果を完全に除外する。** ただし相手が自分をブロックしている場合、既存のチャットルーム自体（`/chat/[roomId]`への直接アクセス）は`is_room_member`が真である限り閲覧可能なまま（メッセージ送信のみRLSで弾かれる）。一覧から消すだけで、ルーム自体を非表示にする対応はPhase 5のスコープ外とした
- **`ChatRoom`のブロックボタンは「自分が相手をブロックしているか」のみ扱う。** `blocks`テーブルのRLS（`blocks_select_own`）は自分の行しか見えない設計（Phase 1由来）なので、相手が自分をブロックしているかはクライアントから判定できない。その場合は送信時にRLSで弾かれ、既存の汎用`sendError`表示に自然に乗る
- **Supabase生成型の`Args`が無引数RPC（`get_conversation_list`等）に対して`never`になる版のcodegenだった。** `supabase.rpc("get_conversation_list")`のように第二引数を省略する呼び出しでtsc上も問題なく通ることをサンドボックスで実際に確認済み（型を手動で書き換えたりはしていない）
- **RPC関数の戻り値の型（`generate_typescript_types`生成分）は、実際にはNULL許容なカラム（`avatar_url`・`last_message_preview`等）でも非nullの型として出力される既知の制限がある。** アプリ側のマッピング処理（`app/home/page.tsx`等）では`?? null`で防御的に扱っている
- **検証方法：** サンドボックス環境に本リポジトリと同一のpackage.json/tsconfig.jsonで実際にファイルを再構成し、`npm install` → `npx tsc --noEmit`で型検証してから納品した

### 動作確認してほしい項目（実機確認用チェックリスト）

1. アカウントを2つ用意し、片方（A）からもう片方（B）のユーザーIDをユーザー追加パネルで検索し、フレンド申請を送る
2. B側：ホーム画面のユーザー追加ボタンに未読バッジが表示され、パネルを開くと「届いているフレンド申請」にAが表示されること。開いた時点でバッジが消える（既読化）こと
3. B側で承認 → A・B双方の「フレンド」タブに相手が表示されること
4. 別の組み合わせで申請 → 受信側が拒否 → 送信側の「送信したフレンド申請」に「拒否されました」と表示されること。同じ相手に再度申請すると送れる（差し戻し）こと
5. 申請中（相手が未応答）の状態で、送信側の「取り消す」から取り消せること。取り消し後は受信側の申請一覧からも消えること
6. フレンドでない相手（見知らぬユーザー）とDMを開始 → 双方のホーム「ストレンジャー」タブに表示され、「未フレンド」等のバッジが出ること。フレンド承認後はそのまま「フレンド」タブへ移ること（会話履歴は引き継がれる）
7. 検索結果の「メッセージ」ボタンから、フレンド関係の有無に関わらずDMを開始できること（既存DMがあればそこへ遷移、無ければ新規作成）
8. 自分の「知らない人からのDM」トグルをオフにした状態で、フレンドでない相手が自分に新規DMを開始しようとするとエラーメッセージが出ること。既存DM・フレンド相手からのDM開始は通常通り成功すること
9. チャット画面右上の「ブロック」→ 相手がホームの一覧（フレンド/ストレンジャーどちらのタブからも）から消えること。メッセージ入力欄・画像添付ボタンが無効化されること
10. 「ブロック解除」→ 再度一覧に表示され送信できるようになること。ただしブロック前にフレンドだった場合でもフレンド関係は自動復元されない（再度フレンド申請が必要）ことを確認
11. 検索結果一覧の「ブロック」からも同様にブロックでき、以降その相手は検索結果・一覧に出てこなくなること
12. 相手アカウント側から自分をブロックしてもらった状態で、自分からメッセージを送信すると（一覧上は普通に見えたままでも）送信時にエラーになることを確認する（相手が自分をブロックしているかはUI上判定できない仕様のため、送信失敗時の挙動として確認）

### 未対応・持ち越し事項（Phase 5時点）

- SRS 3.2.1の「検索」タブは独立実装せず、`AddUserPanel`に統合（上記「設計判断」参照）。本文更新の要否は次回判断
- グループチャットタブは表示のみでプレースホルダー（FR-4実装はPhase未割り当てのまま）
- ブロックした相手との既存チャットルーム自体を一覧外だけでなく閲覧不可にする対応は未実装
- フレンド申請・ブロックにRealtime購読は付けていない（一覧はページ遷移・Server Action後の`router.refresh()`で更新される設計。バッジのリアルタイム更新が必要になったら`friendships`テーブルもRealtime購読対象に追加を検討）
- `dm_from_stranger_enabled`トグルはホーム画面ヘッダーへの暫定配置。専用の設定画面はPhase 7で作る想定（アプリ設定画面・認証設定・通知設定と合わせて）

## Phase 6 の実装内容・詳細

SRS FR-10、FR-16〜FR-21、3.7（一時チャット）、3.8（追加認証）準拠。メッセージ削除・非表示、追加認証（PIN/キー）、一時チャットを実装。

### 設計判断・学び（実装前の深掘りで確定した内容）

- **「各チャットに鍵をかける」(FR-20) はアカウント単位の単一シークレット＋部屋ごとの個人用トグルで実装した。** `docs/srs.md`のデータモデルには`rooms.lock_type/lock_secret`という部屋単位の共有シークレットも定義されているが、①現行RLS（`rooms_update_owner`はDM作成者=ownerのみ更新可）ではDM相手が自分の意思で鍵をかけられない、②5回失敗ロックの追跡列が`rooms`側に無い、という実装上の矛盾があった。ユーザーに確認した結果、意図は「端末を他人に貸したときの覗き見防止。アカウントにつき1つのPIN/キーで、見たくないチャット（または全部）に自分のアカウントからのみ鍵をかける。相手には影響しない」という個人・端末防御の脅威モデルだったため、新設した`room_members.auth_required`（自分の行のみ）で「このチャットに認証を要求するか」をトグルし、シークレット自体は既存の`user_settings.auth_type/auth_secret`（1ユーザー1つ）を使い回す設計にした。**`rooms.lock_type/lock_secret`列は未使用のまま据え置いている。** `docs/srs.md`データモデルとの乖離が生じているため、本文更新の要否は次回判断
- **`room_members.auth_required`の更新は専用RPC（`set_room_auth_required`）経由にした。** `room_members_update_owner`のRLSがowner限定のため、これを緩めて「自分の行なら誰でも更新可」にするとrole列も書き換え可能になってしまう（owner昇格などの拡大）。RLSは変更せず、SECURITY DEFINER関数内で「呼び出し者自身の行のauth_requiredのみ」に限定して更新する既存パターンを踏襲した
- **削除バッチはpg_cron + SQL関数のみで実装（Edge Functions・Vercel Cronは不採用）。** `docs/srs.md:126`「無料プランでの運用を前提とする」に基づく判断。Vercel Cron Jobsは10分間隔・10分以内削除完了というSRS 3.7の要件を満たすには最低Vercel Proプランが必要（Hobbyは1日1回まで）なため、Supabase無料プランのままpg_cron拡張を有効化し、`cleanup_expired_temp_chats()`をDB内で10分毎に直接実行する方式にした。新しいデプロイ経路が増えない利点もある
- **認証ゲート（起動時・各チャット・非表示一覧）はクライアント側`sessionStorage`でタブセッション単位の解錠状態を管理する。** 借りた端末での覗き見防止という脅威モデル（認証済みAPI呼び出しへの防御ではない）に対して相応の実装とした。DB側にセッション状態は持たない
- **ゲートが有効な場合、Server Component（`app/home/page.tsx`・`app/chat/[roomId]/page.tsx`）は保護対象コンテンツ（会話一覧・相手のプロフィール・メッセージ本体）を事前取得しない設計にした。** sessionStorageはクライアントのみで分からないため、Server ComponentがAuthGateの解錠状態を待たずに無条件でデータをRSCペイロードに含めてしまうと、画面上はゲートで隠れていてもHTML/RSCペイロード自体には解錠前のデータが載ってしまう。これを避けるため、ゲートが有効な場合は`HomeContent`/`GatedChatRoomLoader`という新規Client Componentが、AuthGate解錠後に`lib/supabase/client.ts`経由でブラウザから直接データ取得する経路に分岐させている（ゲート無効時は従来通りServer Componentが事前取得する高速経路のまま）
- **起動時ゲートは`/home`と`/chat/[roomId]`の2箇所に個別実装した。** これらを束ねる共有レイアウト（ルートグループ）が無いため、直接URLで`/chat/[roomId]`に来た場合もバイパスされないよう両方に`AuthGate`を置いている。将来ルートが増えた際は`app/(protected)/layout.tsx`のような統合を検討
- **ロック解除フロー（5回失敗後）はアカウントのパスワードで再認証する方式にした。** `lib/supabase/admin.ts`のservice_roleクライアントを都度使い捨てで生成し`signInWithPassword`によりパスワードのみ検証する（`persistSession: false`のため既存のログインセッションには影響しない）。解除後はPIN/キーを覚えていない場合に備え、設定画面へのリンクを表示している
- **ハッシュ化には`bcryptjs`を採用。** pure JSでNode.jsランタイムのServer Action内のみで完結し、Vercel無料プランと相性が良い
- **PostgRESTの重要な落とし穴を発見：`revoke execute ... from public`だけではRPCへの`anon`（未認証）ロールからの直接実行を防げない。** Supabaseはスキーマのデフォルト権限（`ALTER DEFAULT PRIVILEGES`）により、新規作成した関数へ`anon`のEXECUTE権限を自動付与するため、`public`ロールからのrevokeとは別に`anon`へも明示的にrevokeする必要がある（`has_function_privilege('anon', ...)`で実測して発覚）。Phase 6で新規追加した認証系RPC（`record_auth_attempt`・`set_room_auth_required`・`create_temp_dm_room`・`cleanup_expired_temp_chats`）は`anon`から明示的にrevokeして対応済み。**この事象はPhase 1〜5の既存RPC（`block_user`・`get_or_create_dm_room`・`is_room_member`等）にも共通して存在することを確認済み**（各関数内で`auth.uid() is null`をチェックしているため実害は無いが、「authenticated限定」という意図とは一致していない）。Phase 6のスコープ外のため未対応。まとめて棚卸しする場合は別途対応を検討
- **`get_conversation_list`の戻り値に`is_temporary`/`expires_at`を追加する際、`create or replace function`ではなく`drop function` → `create function`が必要だった。** Postgresは戻り値の列構成（`returns table`）を変更する`create or replace`を拒否するため
- **実機テストで発覚：メッセージ削除（FR-16）を直接のテーブルUPDATE（`messages_update_own_delete_only`ポリシー経由）で実装したところ、常に「メッセージの削除に失敗しました。」となる不具合があった。** 原因はPostgreSQLのRLS仕様：UPDATE時、更新ポリシー自身の`WITH CHECK`（`sender_id = auth.uid()`）を満たしていても、PostgreSQLは**更新後の新しい行がSELECTポリシーからも見える状態であること**を暗黙的に要求する。`messages_select_member_not_deleted`は`deleted_at is null`を要求するため、「`deleted_at`を設定して見えなくする」という論理削除の目的そのものがこの暗黙チェックと構造的に衝突し、原理的に直接UPDATEでは実現できないことが判明した（`begin; set local role authenticated; set local request.jwt.claims ...; update ...; rollback;`で実際にシミュレートして再現・特定）。対応として新規RPC `delete_own_message`（SECURITY DEFINER）を追加し、関数内で明示的に`sender_id = auth.uid()`を確認する方式に変更した。**この種の「SELECTポリシーの条件を書き換えるUPDATE（ソフトデリート等）」は直接のテーブルUPDATEでは実現できないという制約は、今後同様のパターン（例：非表示化条件を追加する場合等）を実装する際にも当てはまるため、要注意。**

### 追加ファイル

- `app/actions/messages.ts` — `deleteMessage`（論理削除・FR-16）/ `hideMessage` / `unhideMessage`（FR-17/18）
- `app/actions/auth-secret.ts` — `setAuthSecret` / `clearAuthSecret` / `verifyAuthSecret` / `unlockAuthWithPassword`（FR-19、3.8）
- `components/auth/AuthGate.tsx` — 3スコープ（起動時・各チャット・非表示一覧）共通の認証ゲート
- `app/settings/page.tsx` + `components/settings/AuthSettingsForm.tsx` — PIN/キー設定・起動時/非表示一覧スコープのトグル（CLAUDE.md「次にやること（Phase 6）」で予告していたチャット設定画面の土台）
- `components/home/HomeContent.tsx` — 起動時ゲート有効時の会話一覧クライアント側取得経路
- `components/chat/GatedChatRoomLoader.tsx` — 各チャットゲート有効時のメッセージ本体クライアント側取得経路
- `app/chat/[roomId]/hidden/page.tsx` + `components/chat/HiddenMessagesList.tsx` — 非表示メッセージ一覧（FR-18）
- `components/chat/ChatRoomOptionsMenu.tsx` — チャットオプションメニュー（非表示一覧への導線、各チャットの鍵トグル、一時チャットの「閉じる」）

### 変更ファイル

- `components/chat/ChatRoom.tsx` — RealtimeにUPDATE購読を追加（相手の削除が自分の画面にも反映される）、非表示IDでのフィルタ、削除/非表示ハンドラ、`ChatRoomOptionsMenu`を追加
- `components/chat/MessageBubble.tsx` — 長押し（タッチ）/右クリック（PC）での削除・非表示メニューを追加
- `app/home/page.tsx` / `app/chat/[roomId]/page.tsx` — 起動時ゲート・各チャットゲートの判定・分岐を追加
- `app/actions/rooms.ts` — `toggleRoomAuthRequired` / `closeTempChat` / `startTemporaryDirectMessage`を追加
- `app/actions/settings.ts` — `updateAuthScopeLaunch` / `updateAuthScopeHiddenList`を追加
- `components/home/AddUserPanel.tsx` — 検索結果の「メッセージ」ボタンに有効期限セレクター（通常/10分/1時間/24時間/7日/カスタム）を追加
- `components/home/HomeTabs.tsx` — 一時チャットの残り時間バッジを追加
- `types/supabase.ts` — Supabase MCPの`generate_typescript_types`で再生成（Phase 6のRPC・列を反映）

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration`）

| マイグレーション名                       | 内容                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `phase6_auth_foundation`                  | `room_members.auth_required`列、`record_auth_attempt`/`set_room_auth_required` RPC                        |
| `phase6_temp_chat_creation`               | `get_conversation_list`の戻り値拡張（`is_temporary`/`expires_at`）、`create_temp_dm_room` RPC              |
| `phase6_temp_chat_cleanup_batch`          | pg_cron拡張有効化、`temp_chat_cleanup_log`テーブル、`cleanup_expired_temp_chats`関数、`cron.schedule`登録  |
| `phase6_cleanup_revoke_anon`              | `cleanup_expired_temp_chats`から`anon`のEXECUTE権限を明示的に剥奪                                          |
| `phase6_revoke_anon_from_new_rpcs`        | 上記3件の新規RPCから`anon`のEXECUTE権限を明示的に剥奪                                                      |
| `phase6_delete_own_message_rpc`           | 実機テストで発覚した不具合の修正。`delete_own_message` RPCを新規追加し、`deleteMessage`アクションを直接UPDATEからRPC呼び出しに変更（詳細は上記「設計判断・学び」参照）|

pg_cronジョブ`cleanup-temp-chats`は`*/10 * * * *`（10分毎）で登録済み・`active: true`を確認済み。

### 動作確認してほしい項目（実機確認用チェックリスト）

1. 自分のメッセージを長押し/右クリック→「削除」→送信者・相手どちらの画面からも消えること（相手側はRealtimeで反映）
2. 相手のメッセージを長押し/右クリック→「非表示」→自分の画面のみ消え、相手には見えたままであること
3. チャットオプション→「非表示メッセージ一覧」から復元できること。復元後チャット画面に再表示されること
4. 設定画面（ホーム右上「設定」）でPINまたはキーを設定→「起動時」トグルON→タブを再読み込み→PIN入力画面が表示され、正しいPINで解錠できること
5. PINを5回連続で間違える→ロック表示になること→「アカウントのパスワードで解除する」から実際のログインパスワードで解除できること
6. チャットオプション→「このチャットに鍵をかける」ON→そのチャットだけ開く際にPIN入力が必要になること。**別アカウント（DM相手）側の画面には一切影響しないこと**を確認
7. 設定画面で「非表示メッセージ一覧」スコープをON→非表示一覧を開く際にPIN入力が必要になること
8. ユーザー追加パネルの検索結果から「10分」等の有効期限を選んでメッセージを開始→一時チャットとして作成され、ホーム一覧に残り時間バッジが表示されること
9. 短い有効期限（10分等）でテスト用の一時チャットを作成し、10分経過後にpg_cronの実行（最大10分間隔）でルームが実際に削除されることを確認（Supabase側`cron.job_run_details`やテーブルの`select`で確認）
10. チャットオプション→「チャットを閉じる」（一時チャットのみ表示）→自分側の`temp_chat_sessions.closed_at`が設定されること。双方が閉じた場合は次回のバッチ実行で削除されることを確認

### 未対応・持ち越し事項（Phase 6時点）

- `rooms.lock_type/lock_secret`は未使用のまま。`docs/srs.md`データモデルとの乖離があるため、SRS本文の更新要否を次回判断
- Phase 1〜5の既存RPCに残る`anon`実行権限（上記「設計判断・学び」参照）はPhase 6のスコープ外のため未対応。まとめて棚卸しする場合は`/security-review`等での対応を検討
- 起動時ゲートが`/home`・`/chat/[roomId]`の2箇所への個別実装になっている。ルートグループ化による統合はスコープ外
- 既存DMを後から一時チャット化する機能は未実装（SRSに明記が無いため対象外とした）
- グループチャットUI（FR-4）は引き続きPhase未割り当てのまま。`ChatRoomOptionsMenu`・`room_members.auth_required`等はグループチャットにも将来流用できる設計にしてある
- `components/home/AddUserPanel.tsx`（Phase 5実装）に、新しいESLintルール（`react-hooks/set-state-in-effect`）由来の既存エラーが3件ある（Phase 6の変更とは無関係、今回は未対応）

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

## Phase 8 の実装内容・詳細

Phase 6・7で積み上がった「未対応・持ち越し事項」の棚卸しに着手。新機能追加ではなく、①オフライン時のServer Action呼び出しが未処理例外になるバグの修正、②`anon`ロールのRPC実行権限の棚卸し、③`AddUserPanel.tsx`の既存ESLintエラー3件の解消、④デッドコード削除、⑤UI・アクセシビリティ面の小粒修正、に集中した「地固め」フェーズ。実装に先立ち3つの調査エージェント（技術的負債の再検証／SRSと実装の突き合わせ／コード品質・UX粗探し）を並行実行し、既知の持ち越し事項が記録内容より実際には広範囲に及んでいたことを確認してから着手した。

### 追加ファイル

- `lib/errors.ts` — Server Action呼び出し失敗時の共通インラインエラーメッセージ（`NETWORK_ERROR_MESSAGE`）。7ファイルへのコピペによる文言ズレを防ぐため新設

### 変更ファイル（オフライン時未処理例外の修正）

`components/settings/NotificationSettingsForm.tsx` / `AuthSettingsForm.tsx`・`components/auth/AuthGate.tsx`・`components/home/AddUserPanel.tsx`・`components/chat/ChatRoom.tsx` / `ChatRoomOptionsMenu.tsx` / `HiddenMessagesList.tsx`（計7ファイル・22箇所）— `await xxxAction(...)`をすべてtry/catchで囲んだ。楽観的更新のある箇所（トグル系）はcatch節でロールバックし、`NETWORK_ERROR_MESSAGE`をエラー表示用stateにセットする形に統一。`AddUserPanel.tsx`の未読バッジ既読化（`markFriendRequestsRead`）のみ、UI表示不要なバックグラウンド処理のため`.catch(() => {})`に留めた。

### 変更ファイル（その他）

- `app/actions/rooms.ts` — デッドコードだった`startDirectMessage`（Phase 5で呼び出し元`NewDmForm.tsx`削除済み・以後未参照）を削除
- `components/home/AddUserPanel.tsx` — ESLintエラー3件を`InstallPrompt.tsx`と同じパターン（各effect内で最初の同期setState呼び出しの直前にのみdisableコメント）で解消。検索0件時の表示・検索欄の`aria-label`も追加
- `components/home/HomeTabs.tsx` — `app/actions/friends.ts`の`removeFriend`（Phase 5実装済みだが呼び出すUIが無かった）を使う「フレンド解除」ボタンを追加。会話一覧取得エラー時の表示（`loadError` prop）も追加
- `components/chat/ChatRoom.tsx` — メッセージ0件時の空状態、送信ボタンの送信中表示、画像alt属性、画像取り消しボタンのタップ領域拡大、`<textarea>`の`maxLength={4000}`、日付区切り表示を追加
- `components/chat/MessageBubble.tsx` — 画像`alt`属性を意味のある文言に変更
- `components/chat/HiddenMessagesList.tsx` — 画像`alt`属性の修正
- `components/chat/ChatRoomOptionsMenu.tsx` — 「チャットを閉じる」に確認ダイアログを追加
- `components/settings/AuthSettingsForm.tsx` — PIN入力欄に`inputMode="numeric"`・`maxLength={8}`を追加
- `app/page.tsx` — 「Phase 0・基盤構築中」のまま放置されていたフッター文言を更新し、`/login`・`/signup`への導線を追加
- `app/home/page.tsx` / `components/home/HomeContent.tsx` — `get_conversation_list`/`get_friend_requests`/`blocks`取得の`.error`を確認し、失敗時に`loadError`を`HomeTabs`へ伝播するよう修正（従来は`.data ?? []`のみでエラーが空状態と区別できなかった）
- `components/chat/GatedChatRoomLoader.tsx` — メッセージ取得の`.error`を確認し、失敗時は既存の`{status:"error"}`分岐に合流するよう修正
- `.env.example` — 未使用の`NEXT_PUBLIC_APP_URL`を削除
- `docs/srs.md` — `Room`データモデルの`lock_type`/`lock_secret`に、実際の設計（`room_members.auth_required`＋`user_settings.auth_type/auth_secret`）についての注記を追加。`RoomMember`モデルに`auth_required`列を追記

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase8_revoke_anon_from_legacy_rpcs"）

Phase 1〜5の既存RPC 13関数 + Phase 6で戻り値拡張した`get_conversation_list()`（後述）の計14関数について、`anon`ロールから明示的にEXECUTE権限をrevoke。適用後、全関数で`has_function_privilege('anon', ..., 'execute')`が`false`になることを実測確認済み。

### 設計判断・学び

- **`unstable_rethrow`が必要なケースを実装前に発見。** `components/home/AddUserPanel.tsx`の`handleMessage`が呼ぶ`startDirectMessageWithUser`/`startTemporaryDirectMessage`（`app/actions/rooms.ts`）は成功時に`redirect()`を呼ぶが、Next.jsの`redirect()`は`digest`付きの特殊なエラーをthrowすることで遷移を実現する仕組みのため、素朴にtry/catchすると内部シグナルまで握りつぶし遷移が起きなくなる（サイレントな退行）。実装前に`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`を実際に確認し、catch節の先頭で`next/navigation`の`unstable_rethrow(err)`を呼んで内部シグナルを再送出してから、それ以外の例外だけをネットワークエラーとして扱う実装にした。22箇所中この1関数のみ特別対応が必要（他は全て`redirect()`を呼ばない`{success, error}`形式のみ）
- **`get_conversation_list()`はPhase 6で戻り値拡張（`is_temporary`/`expires_at`追加）のため`drop function`→`create function`し直されており、当時のanon revoke対象リスト（`record_auth_attempt`等3関数）から漏れていたことが今回の調査で判明した。** Postgresの`drop`→`create`は新しいOIDの関数を作ることになり古いACLを引き継がないため、他の新規関数と同様にデフォルト権限でanonにEXECUTEが自動付与された状態のまま残っていた。「Phase 6で触った関数」であっても棚卸し漏れが起きうるという教訓として記録
- **`AuthSettingsForm.tsx`の`toggleScopeLaunch`/`toggleScopeHiddenList`、`NotificationSettingsForm.tsx`の`togglePush`/`toggleDmFromStranger`は、try/catch追加以前から`{success:false}`分岐でも`setError`を呼んでおらずサイレントにロールバックするだけだった。** try/catch化のついでにこの4箇所にも`setError(result.error)`を追加し、他のハンドラと同じエラー表示に揃えた
- **`HomeTabs.tsx`の`ConversationRow`はチャット遷移用の`<Link>`が行全体を覆う構造だったため、フレンド解除ボタンをLinkの兄弟要素として配置した。** Link内にbuttonをネストすると無効なHTML構造になるため。一覧の更新は`AddUserPanel.tsx`の他のハンドラと同じく`router.refresh()`で行う設計にした（`HomeTabs`側でconversationsをローカルstateへ複製していないため）
- **今回の調査で発見した中規模〜大規模の項目（汎用エラー画面`error.tsx`、チャット内検索・フィルタFR-14、ユーザー追加UIのレスポンシブ配置FR-15、削除・非表示メニューのキーボード操作対応、依存パッケージのバージョン更新）はスコープ外とし、次のPhase候補として下記「次にやること」に記録した。** バグ修正・技術的負債の解消と同じセッションで新機能や依存関係更新まで一緒くたにしないという判断

### 動作確認してほしい項目（実機確認用チェックリスト）

1. ブラウザのDevToolsでオフラインに切り替えた状態で、設定画面の各トグル（通知・DM受信・追加認証スコープ）を操作し、エラー画面に落ちずインラインエラーメッセージが出ることを確認する
2. オンラインに戻し、ユーザー追加パネルから新規DM開始（通常・一時チャット双方）が引き続き正しく`/chat/[roomId]`へ遷移することを確認する（`unstable_rethrow`の退行確認として最重要）
3. メッセージ削除・チャットを閉じる操作で確認ダイアログが出ること、キャンセルすると何も起きないこと
4. フレンドのホーム一覧から「解除」→ 双方の「フレンド」タブから消える（相手側は「ストレンジャー」タブに移る）ことを確認する
5. 検索してヒットしないユーザーIDを入力し、「ユーザーが見つかりませんでした」等の表示が出ることを確認する
6. メッセージが1件も無いチャットを開き、空状態メッセージが表示されることを確認する
7. 過去メッセージを読み込んで日付をまたぐ会話で、日付区切り（「今日」「昨日」またはYYYY年M月D日）が表示されることを確認する
8. `AddUserPanel.tsx`で`npx eslint`がエラー0件になっていることを確認する（`react-hooks/set-state-in-effect`3件の解消）

### 未対応・持ち越し事項（Phase 8時点）

- `rooms.lock_type`/`lock_secret`は列としては未使用のまま残置（`docs/srs.md`のみ実態に合わせて更新。スキーマ変更はユーザーとの合意により今回見送り）
- 依存パッケージのバージョン更新（`next` 16.2.12→16.3.0、`react`/`react-dom` 19.2.4→19.2.8、`@supabase/supabase-js` 2.112.0→2.112.3等）は未対応。`@types/node`が`^20`のまま（技術スタック表のNode.js 22系と不一致）なのも未対応。今回の調査で判明したが、バグ修正と同じセッションで一緒くたにするのは避けた
- SRS未実装の中規模項目（今回の調査で新たに発見・詳細は下記「次にやること」）：汎用エラー画面（`error.tsx`/`global-error.tsx`、SRS 3.4）、チャット内検索・フィルタ（FR-14。ユーザー追加検索とは別物）、ユーザー追加UIのPC/スマホレスポンシブ配置（FR-15）、メッセージ削除・非表示メニューのキーボード操作対応
- SRS 3.2.3の統一エラーレスポンス形式（`{error:{code,message}}`）は、ほぼ全てのServer Actionが独自の`{success,error}`形式を返しており実質未準拠（`app/api/cloudinary/sign/route.ts`のみ準拠）。アーキテクチャ上の判断（Server ActionsはHTTPステータスを持たない）として記録のみ
- グループチャットUI（FR-4）は引き続きPhase未割り当て。今回の調査で、`room_members`のRLS（`room_members_insert_self_or_owner`/`_delete_self_or_owner`）は既にメンバー追加・削除を許容する設計になっている一方、複数人ルーム作成RPC・メンバー追加/削除Server Action・`get_conversation_list`及び`app/chat/[roomId]/page.tsx`の「相手1人」前提の書き換えは未着手であることを確認した（スコープの精緻化のみ、実装はしていない）

### 追加対応：Realtimeパブリケーションの棚卸し（Phase 8完了後）

実機確認中にユーザーから「フレンド申請/解除・ブロックが相手側でリロードしないと反映されない」との指摘があり、`supabase_realtime`パブリケーションが`messages`のみ有効（Phase 5時点の意図的な設計。持ち越し事項参照）だったことを再確認した。無料プランでの負荷影響を検討した結果（`postgres_changes`は実際に配信されたメッセージ数に対してカウントされる方式のため、パブリケーションへの追加自体は購読コードが無い限りほぼノーコスト）、`friendships`・`blocks`の2テーブルを`supabase_realtime`パブリケーションに追加した（マイグレーション`phase8_realtime_friendships_blocks`、適用・`pg_publication_tables`での反映確認済み）。`room_members`/`rooms`/`message_hidden`/`user_settings`等は、現状どの画面もそれらの変更を購読する予定が無いため見送った。

**注意：パブリケーション追加だけでは体感は変わらない。** アプリ側（`HomeContent.tsx`等）に`friendships`/`blocks`の変更を実際に購読する`postgres_changes`コードがまだ無いため、「相手の操作が自分の画面にリアルタイム反映される」という体験を実現するには別途購読コードの実装が必要（未対応。対応する場合は次回セッションでユーザーと相談）。

## Phase 9 の実装内容・詳細

Phase 8完了後の棚卸しで見つかった、SRSに明記されているが未実装だった4項目（次にやること候補1）をまとめて実装。新機能ではなく既存SRS要件への準拠を埋める作業で、グループチャットUIのような大規模機能には手を付けていない。

### 追加ファイル

- `app/error.tsx` — SRS 3.4の汎用エラー画面。ルートレイアウト配下（`/home`・`/chat/[roomId]`・`/settings`等）のレンダリング時例外を捕捉する
- `app/global-error.tsx` — ルートレイアウト自体がクラッシュした場合のみ発火する最終防衛ライン。独自の`<html>`/`<body>`を持ち、`app/layout.tsx`と同じ3フォントを再宣言し`./globals.css`を直接importする
- `app/not-found.tsx` — `app/chat/[roomId]/page.tsx`・`hidden/page.tsx`の`notFound()`呼び出しと、存在しないURL全般の両方をカバーするブランド準拠の404画面

### 変更ファイル

- `components/chat/MessageBubble.tsx` — SRS 3.3のキーボード操作対応。`ChatRoomOptionsMenu.tsx`と同じ「実ボタン＋トグル」パターンで、長押し・右クリックに加えキーボード（Tab到達→Enter/Spaceで開く）でも削除・非表示メニューを開けるようにした。ホバー・フォーカス時のみ表示（`group-hover`/`focus-visible`）。Escapeでメニューを閉じられるようにした
- `components/home/HomeTabs.tsx` — FR-14（フレンド・ストレンジャー一覧内の検索）を追加。タブボタン直下に検索欄を新設し、`otherDisplayName`/`otherUsername`の部分一致でクライアント側フィルタする（新規RPC不要）。タブのカウント数は絞り込み前の値のまま維持。「検索条件に一致する会話がありません」を既存の空状態と別に用意した。あわせてFR-15対応で`md:min-w-0`と、モバイル版ボトムバー（後述）に隠れないよう一覧のスクロール領域に`pb-14 md:pb-0`を追加
- `app/home/page.tsx` — FR-15対応。`<HomeContent>`を包む領域を`flex flex-col md:flex-row`にし、PCではサイドバー・スマホでは縦積みのレイアウトに切り替えられるようにした
- `components/home/AddUserPanel.tsx` — FR-15対応。外枠コンテナをスマホでは`fixed inset-x-0 bottom-0`のボトムバー、PC（`md:`）では`md:static md:w-72`のサイドバーに変更。内部の検索・フレンド申請・ブロック一覧のマークアップ自体は変更していない

### 設計判断・学び

- **Next.js 16.2.12の`error.tsx`/`global-error.tsx`は`{ error, reset }`ではなく`{ error, unstable_retry }`を受け取る。** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`を実際に確認して判明（`unstable_retry`はv16.2.0で追加、公式ドキュメントも`reset()`より`unstable_retry()`の使用を推奨している）。一般的なNext.js知識（`reset`ベース）のまま実装すると「再試行」ボタンが動作しない、という典型的なバージョン固有の落とし穴だった
- **`global-error.tsx`はルートレイアウトの`<head>`・フォント・`globals.css`を自動継承しない。** 公式ドキュメントで明記されている仕様（「global-errorはグローバルスタイルを含まない」）。`app/layout.tsx`と同じ3フォント宣言＋`./globals.css`のimportを意図的に重複させることで、真の最終エラー画面でもブランドの見た目を保つようにした
- **FR-15のレスポンシブ切り替えはCSSメディアクエリのみで実装し、JSでのブレークポイント判定は行っていない。** `AuthGate.tsx`/`OfflineBanner.tsx`が「SSR時はnull→マウント後に実値」という回避策を取っているのと同種のハイドレーション不一致リスクを、新たに持ち込まないための判断
- **FR-15の`open`状態（開閉トグル）はPC・スマホで共通のまま変更していない（初期値は折りたたみ）。** SRSの要求は「配置」（サイドバー／ボトムバーという位置）であり「常時展開」までは明記されていないための簡略化。PCでもサイドバーが初期状態では折りたたまれて見える点は既知の挙動として記録する。見た目を確認後、「PCではデフォルト展開」に変更する余地がある
- **FR-14の「オプションで同グループメンバーも追加可」は未実装のまま。** 複数人グループチャット自体が未実装（FR-4、Phase未割り当て）のため、会話履歴が無いグループメンバーを検索対象に追加するというオプション機能は実装できない。この点はSRS本文の書き換えは行わず（Phase 5の「検索タブ統合」判断と同様、本文とアプリの意図的な差分としてこのCLAUDE.mdにのみ記録する方針を踏襲）、実装が完了していない部分としてここに明記する

### 動作確認してほしい項目（実機確認用チェックリスト）

1. コンポーネント内で一時的に`throw new Error("test")`を仕込むなどして例外を起こし、`app/error.tsx`が表示され「再試行」ボタンでコンポーネントが再レンダリングされることを確認する（確認後は必ず削除する）
2. 存在しない`roomId`で`/chat/xxxxx`にアクセスし、ブランドに沿った404画面が出ることを確認する
3. 存在しないURL（例：`/foo`）にアクセスしても同じ404画面が出ることを確認する
4. フレンド・ストレンジャー一覧の検索欄に入力し、一致する会話だけが表示されること。タブの人数表示が検索中も変わらないことを確認する
5. デスクトップ幅・スマホ幅（DevToolsのレスポンシブモード、または実機）それぞれで`/home`を開き、ユーザー追加UIがサイドバー／ボトムバーとして正しく配置されることを確認する。スマホでボトムバー展開時に会話一覧の最後の行が隠れていないことを確認する
6. キーボードのみ（マウス不使用）でメッセージ一覧をTab移動し、各メッセージの「メッセージの操作」ボタンにフォーカスできること、Enterでメニューが開き、Escapeで閉じられることを確認する

### 未対応・持ち越し事項（Phase 9時点）

- FR-14の「オプションで同グループメンバーも追加可」チェックボックスは、グループチャットUI（FR-4）実装後に対応する
- FR-15の「PCでは常時展開」（今回はPC・スマホ共通のトグル開閉のまま）は、見た目を確認後の追加調整候補として残す
- Phase 8で見つかった依存パッケージのバージョン更新・グループチャットUI・複数チャットレイアウト対応・テキスト送信自動リトライ・真の楽観的更新・フレンド申請/ブロックのRealtime購読コードは、いずれも今回のスコープ外のまま

## Phase 10 の実装内容・詳細

Phase 8で`friendships`・`blocks`を`supabase_realtime`パブリケーションに追加したが購読コードが無かった件（Phase 8「追加対応」参照）に対応。フレンド申請・承認・拒否・取り消し・解除を相手側の画面にもリロード無しで反映できるようにした。

### 変更ファイル

- `components/home/HomeContent.tsx` のみ。`AddUserPanel.tsx`（Phase 8で`useEffect(() => setRequests(initialRequests), [initialRequests])`を実装済み）・`HomeTabs.tsx`（`conversations`propをそのまま使う設計）はどちらも親から渡されるpropsの変化を自動的に反映する既存の仕組みを持っているため、変更不要だった

### 実装内容

- **非ゲート時：** `HomeContent`本体に`useRouter()`を追加し、`friendships`テーブルを`event: "*"`・フィルタ無しで購読する`useEffect`（`if (gated) return;`ガード付き。Reactのフック規約上、条件分岐の手前で無条件にフックを呼ぶ必要があるため）。イベント受信時は`router.refresh()`を呼ぶだけ（Server Componentが再実行され新しいpropsが流れてくる、既存の慣習をそのまま踏襲）
- **ゲート時（`GatedHomeBody`）：** `router.refresh()`はAuthGate解錠前提のServer Component側データ取得スキップ設計をバイパスできないため効かない。`reloadKey`（`useState(0)`）を新設し、既存のデータ取得`useEffect`の依存配列を`[userId]`→`[userId, reloadKey]`に変更。別の`useEffect`で`friendships`を購読し、イベント受信時に`setReloadKey((k) => k + 1)`することで既存の`load()`を再実行させる
- どちらも`ChatRoom.tsx`の既存Realtime購読と同じ`channel().on("postgres_changes",...).subscribe()`パターンを踏襲し、アンマウント時に`supabase.removeChannel(channel)`でクリーンアップする

### 設計判断・学び

- **`blocks`はRealtime購読の対象にしなかった。** `docs/schema.sql`の`blocks_select_own`ポリシー（`blocker_id = auth.uid()`のみ）により、RLSは「自分がブロックした行」しか見せない設計（Phase 5の意図的な設計。相手が自分をブロックしているかは判定できない）。したがって`blocks`を購読しても、自分の操作（既にローカルUIで即時反映済み）しか受信できず実益が無いと判断した。`supabase_realtime`パブリケーションへの登録自体（Phase 8で実施済み）は、将来「自分の操作を他タブでも反映したい」等の別要件が出た場合の土台として残してある
- **`friendships`は`filter:`を指定せず無条件購読でよいことを、Supabase公式ドキュメント（MCPの`search_docs`）で確認してから実装した。** 「Postgres ChangesはRLSが有効なテーブルでは、読み取りを許可されたクライアントにのみレコードが送信される」という仕様のため、`friendships_select_involved`ポリシー（`requester_id = auth.uid() or addressee_id = auth.uid()`）がクライアント側の絞り込みを代替する。Realtimeの`filter:`オプションは1カラムの等価条件のみでOR条件を書けない制約があり、もしRLSに頼らず自前でフィルタしようとしていたら「申請者側」「宛先側」で2つの購読を用意する必要があったところだった
- **ゲート時・非ゲート時で購読ロジックを分けたのは、Reactのフック規約（条件付きでフックを呼べない）と、`GatedHomeBody`が独自のデータ取得ライフサイクルを持つという既存の設計上の理由の両方による。**

### 動作確認してほしい項目（実機確認用チェックリスト）

1. アカウントAからBへフレンド申請を送信 → **Bの画面をリロードせずに**未読バッジ・「届いているフレンド申請」に表示されること
2. B側で承認・拒否 → **Aの画面がリロード無しで**フレンド一覧・送信済み申請の表示が更新されること
3. フレンド解除でも同様に相手側がリロード無しで反映されること
4. 起動時ゲート（PIN/キー）を有効にしたアカウントでも同様に動作すること（`GatedHomeBody`経路の確認）

### 未対応・持ち越し事項（Phase 10時点）

- `blocks`のRealtime購読は上記の理由により未実装のまま（意図的な判断であり持ち越しではない）
- デバウンス等の最適化は行っていない（現状の想定トラフィックでは不要と判断）

## Phase 11 の実装内容・詳細

Phase 8で見つかっていた依存パッケージのバージョン更新（`npm outdated`で確認済みの「安全そうなパッチ/マイナー更新」）に対応。

### 変更ファイル

- `package.json` — 以下を更新（`next`/`react`/`react-dom`/`eslint-config-next`は既存の慣習に合わせて厳密バージョン指定のまま更新）：
  - `next`: `16.2.12` → `16.3.0`
  - `eslint-config-next`: `16.2.12` → `16.3.0`（`next`本体とバージョンを揃える）
  - `react` / `react-dom`: `19.2.4` → `19.2.8`
  - `@supabase/supabase-js`: `^2.112.0` → `^2.112.3`
  - `@types/node`: `^20` → `^22`（技術スタック表の「Node.js 22系」との不一致を解消。`npm outdated`の「Latest」欄は`26.2.0`だったが、これは実行環境のNode.jsバージョンと無関係に存在する最新配布に過ぎないため追従せず、実際のランタイム target に合わせた）
- `app/error.tsx` / `app/global-error.tsx` — 後述の`retry`プロパティ名変更に追従
- `package-lock.json` — `npm install`実行に伴う更新

### あえて更新しなかったもの

- `eslint`: `^9` → `10.x`（メジャーバージョン。flat config移行等の追加作業が必要になる可能性があり、今回の「安全そうな更新」の対象外と判断）
- `typescript`: `^5` → `7.x`（Phase 8の調査時点から記録済みの通り、Go実装のネイティブコンパイラ系列でありsemver上のメジャーとは性質が異なる。反射的に追従するものではないため見送り）

### 設計判断・学び

- **`next` 16.2.12→16.3.0という一見「マイナー」な更新の中に、実際に使用しているAPIの破壊的変更が含まれていた。** `app/error.tsx`/`app/global-error.tsx`（Phase 9で実装）が使う`error.tsx`のpropsが、v16.3.0で`unstable_retry`から安定版の`retry`へ名称変更されていた（`node_modules/next/dist/docs/.../error.md`のVersion Historyで確認：「v16.3.0: retry prop became stable」）。後方互換のエイリアスは提供されておらず、更新して気づかずに放置していたら「再試行」ボタンをクリックした瞬間に実行時エラーになるところだった。AGENTS.mdが警告する「このNext.jsフォークは通常と異なる破壊的変更を含みうる」を体現する実例として記録する。**パッチ/マイナーに見えるバージョン更新でも、実際に使用している実験的（`unstable_`プレフィックス）APIについては更新の都度ドキュメントを再確認する習慣が必要**
- **`unstable_rethrow`（Phase 8で`AddUserPanel.tsx`が使用）は16.3.0でも名称変更されていないことを確認済み**（ドキュメント冒頭に`version: unstable`のまま）。同じ「unstable_」プレフィックスでも安定化のタイミングは関数ごとに異なるため、それぞれ個別に確認する必要がある
- **`npm install`後に`npm audit`で`nanoid`のhigh severityな脆弱性（`GHSA-2v37-7h3g-55p8`）が新たに検出され、`npm audit fix`で解消した。** 直接の依存関係ではなく間接依存（他パッケージ経由）だったため、`package.json`には現れない

### 検証方法・実施内容

- `npm install`実行後、`node_modules/next/package.json`等で実際にインストールされたバージョンを確認
- `npm audit` → `npm audit fix`で脆弱性0件を確認
- `npx tsc --noEmit` / `npx eslint .` / `npm run build`（`.next`を一度削除してのクリーンビルド）をすべて実行し、エラー0件を確認

### 未対応・持ち越し事項（Phase 11時点）

- `eslint`（9→10）・`typescript`（5→7系）のメジャー更新は今回見送ったまま。対応する場合は別途セッションを設けて移行作業を検討する

## Phase 12 の実装内容・詳細

Phase 11で見送った依存パッケージのメジャー更新（`eslint` 9→10、`typescript` 5→7系）に着手。実装前の調査で、当初の想定（`typescript`を7系まで一気に上げる）が現時点では実行不可能であることが判明し、さらに`eslint`の10系更新も実際に動かしてみたところ`eslint-config-next`が同梱するプラグインの一つが実行時クラッシュすることが分かった。結果として**`typescript`のみ5→6.0.3に更新し、`eslint`は9のまま据え置く**という、当初の候補（CLAUDE.md「次にやること（Phase 12・未確定）」候補2）とは異なる着地になった。

### 変更ファイル

- `package.json` — `typescript`: `^5` → `~6.0.3`（`eslint`は`^9`のまま変更なし）
- `package-lock.json` — `npm install`実行に伴う更新

### 調査で判明した内容（実装前にnpmレジストリ・実機検証で確認）

1. **`typescript`の7系更新はブロックされている。** `eslint-config-next`が内部で使う`typescript-eslint`（現行8.65.0、canary版8.67.1-alpha.0でも同じ）の`peerDependencies`が`typescript: ">=4.8.4 <6.1.0"`に固定されており、7系は対象外。原因はTypeScript 7.0（Go移植のネイティブコンパイラ、通称tsgo）が`typescript-eslint`・`ts-morph`等が依存する**Programmatic Compiler API（旧Strada）を提供していない**ため。この制約が外れるのは**TypeScript 7.1（2026年秋予定）**と見込まれている
2. **TypeScript本体は5.9の後、2026年3月に6.0を「最後のJS実装版・7.0への移行リリース」として正式リリース済み。** 6.0系はそのまま6.0.3が最新で、6.1系列自体がnpmに存在しない（6.0.3の次は7.0.1-rc）。`typescript-eslint`の許容上限`<6.1.0`にちょうど収まる
3. **`tsconfig.json`は6.0の新デフォルト・非推奨化の影響を受けなかった。** `target: ES2017`・`moduleResolution: bundler`・`module: esnext`・`esModuleInterop: true`をいずれも明示指定済みで、6.0で非推奨化された`target: es5`・`moduleResolution: node/classic`・`baseUrl`・`outFile`等は元々未使用だったため。`npx tsc --noEmit`は変更前と同じくエラー0件
4. **`eslint`の10系更新は実際に`npm install`・`npx eslint .`まで試したところ実行時クラッシュした。** `npm install`時点で`eslint-config-next`が同梱する`eslint-plugin-import`・`eslint-plugin-jsx-a11y`・`eslint-plugin-react`（いずれも2026年8月時点のnpm最新版）の`peerDependencies`が`eslint`10系を含んでおらず`ERESOLVE overriding peer dependency`警告が出た。警告だけなら実害が無いことも多いため実際に`npx eslint .`を実行して検証したところ、`eslint-plugin-react@7.37.5`内の`react/display-name`ルールが`context.getFilename is not a function`で例外を投げ、`.ts`ファイル（JSXすら含まない`app/actions/auth.ts`）を対象にした時点で即座にクラッシュした。ESLint 10で`RuleContext`から`getFilename()`等のレガシーAPIが除去された影響とみられる。**単なるpeer警告と実際の動作可否は別物であり、`npm install`が通ってもlintそのものは動かないケースが実在することを確認した実例。** `eslint-config-next`のcanary版（16.3.1-canary.13）・preview版（16.3.0-preview.10）でも同梱プラグインのバージョンは変わらず、この時点では回避策が無いと判断した
5. 上記4の発覚を受けて`eslint`を`^9`（実際にインストールされるのは9.39.5）に戻し、`typescript`を6.0.3のまま`npx eslint .`（エラー0件）・`npx tsc --noEmit`（エラー0件）・クリーンビルド・`npm audit`を再実行し、いずれも問題ないことを確認してから確定させた

### 設計判断・学び

- **「メジャーバージョン更新の計画」フェーズで実際にインストール・実行まで検証したことで、npmレジストリの調査だけでは分からない実行時クラッシュを実装前に発見できた。** Phase 11の教訓（パッチ/マイナーに見えても実使用APIの破壊的変更がありうる）の延長線上だが、今回はさらに一歩踏み込み、「peer dependencyの警告が出ないこと」と「実際にコマンドが動くこと」は別の確認軸であることを実例で確認した。今後同種のメジャー更新を検討する際は、`npm ls`でのpeer警告確認だけで終わらせず、必ず対象コマンド（今回は`eslint .`）を実際に一度実行してから確定する運用を徹底する
- **`typescript-eslint`・`eslint-plugin-react`等、直接の依存関係ではなく`eslint-config-next`が内部で選ぶ間接依存のバージョンは、こちら側の`package.json`を書き換えても制御できない。** Next.js本体・`eslint-config-next`側の追従を待つほかない受動的な制約として記録する

### 検証方法・実施内容

- `npm install`実行後、`npm ls typescript typescript-eslint eslint eslint-config-next`でinvalid/override警告が無いことを確認
- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件、クラッシュ無し）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `npm audit`（脆弱性0件）

### 未対応・持ち越し事項（Phase 12時点）

- **`typescript`の7系更新：** `typescript-eslint`がTypeScript 7.1（2026年秋予定）に対応し次第、別セッションで再検討する。次回セッション開始時は`npm view typescript-eslint peerDependencies`で許容範囲が広がっていないか確認するとよい
- **`eslint`の10系更新：** `eslint-config-next`が同梱する`eslint-plugin-react`（または`eslint-plugin-import`・`eslint-plugin-jsx-a11y`）がESLint 10のRuleContext API変更に追従し、`npx eslint .`が実際にクラッシュせず動作することを確認できてから再挑戦する。`eslint-config-next`の新しいバージョンがリリースされたタイミングで、まず`npm view eslint-config-next@latest dependencies`で同梱プラグインのバージョンが更新されているかを確認してから着手するとよい

## Phase 13 の実装内容・詳細

Phase 9で持ち越されていた事項（CLAUDE.md「未対応・持ち越し事項（Phase 9時点）」・「次にやること（Phase 13・未確定）」候補1）のうち、ユーザー追加パネル（`AddUserPanel.tsx`）のPC表示を「常時展開」に変更する対応のみを実施。FR-14の「同グループメンバーも検索対象に追加」チェックボックスは、グループチャットUI（FR-4）が引き続き未実装のため今回もスコープ外のまま。

### 変更ファイル

- `components/home/AddUserPanel.tsx` のみ

### 実装内容

- パネル本体（検索欄・フレンド申請一覧・ブロック一覧等）を`{open && (...)}`による条件付きマウントから、常時マウント＋動的classNameでの表示切り替えに変更した：`` className={`${open ? "flex" : "hidden"} ... md:flex md:max-h-none`} ``。768px未満では従来通り`open`に応じて`hidden`/`flex`が切り替わり、768px以上では`md:flex`が常に上書きして`open`の値に関わらず常時表示される
- ヘッダーのトグルボタン自体（クリックで`open`をトグルする挙動）は変更していない。PCでは見た目上ボタンをクリックしても表示は変化しないが、後述の理由によりあえて残した

### 設計判断・学び

- **JSでのブレークポイント判定（`window.matchMedia`等）は今回も使わず、CSSメディアクエリのみで実現した。** Phase 9で確立した方針（`AuthGate.tsx`/`OfflineBanner.tsx`と同種のハイドレーション不一致リスクを持ち込まない）をそのまま踏襲。パネル本体を常時マウントに変更したこと自体も、SSR/クライアントの初期描画が常に`open=false`から始まる点は変わらないため、ハイドレーション不一致のリスクを増やしていない（`display:none`になるだけ）
- **PC表示ではヘッダーのトグルボタンをあえて`md:hidden`にせず残した。** 「常時展開＝折りたたみ不可」にする以上、PCでは本来クリックしても見た目が変わらない“死んだボタン”になるが、唯一`open`に依存する副作用（未読フレンド申請の既読化`useEffect`、107-112行目）をPC利用者が手動で発火させる導線としてあえて機能させている。ボタンを隠すと、PCで未読バッジを既読化する手段が完全に失われてしまうため
- **既知の制約：PCでは初期表示時点からパネル本体が見えているにもかかわらず、未読バッジは自動では消えない。** `markFriendRequestsRead()`が`open`（真偽値）依存のままのため、初期状態の`open=false`のままではPC利用者が実際にフレンド申請を目にしていても既読化されない。消すにはヘッダー行を一度クリックする必要がある（クリックしてもパネルの表示自体に変化はない）。「PCではマウント時に無条件で既読化する」という対応も検討したが、スマホ側の`open`依存の挙動（Phase 5の「開いた時点でバッジが消える」という確認済み仕様）を退行させずに実現するにはJSでのブレークポイント判定が必要になり、上記の既存方針と衝突するため見送った。小さな非対称性として許容する

### 動作確認してほしい項目（実機確認用チェックリスト）

1. PC幅（768px以上）で`/home`を開き、リロード直後からユーザー追加パネルが折りたたまれず表示されていること
2. スマホ幅（768px未満）では従来通り初期状態は折りたたみで、ヘッダーをタップすると開閉できること
3. PC幅のまま、フレンド申請を受信した状態でヘッダーの未読バッジが表示され、ヘッダーを一度クリックすると（Phase 10のRealtime購読経由で）バッジが消えることを確認する。クリックしてもパネルの表示自体に変化が無いことも合わせて確認する
4. スマホ幅では、Phase 5の確認項目通り「開いた時点でバッジが消える」挙動が変わっていないことを確認する

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 上記「動作確認してほしい項目」はユーザーによる実機確認待ち（開発体制上、UIの動作確認はユーザー担当のため）

### 未対応・持ち越し事項（Phase 13時点）

- 未読バッジがPCで自動的には消えない既知の制約（上記「設計判断・学び」参照）は今回は許容し、そのまま残した
- FR-14の「同グループメンバーも検索対象に追加」チェックボックスは、グループチャットUI（FR-4）実装後に対応する（Phase未割り当てのまま）

## 検討中のアイデア・未確定のPhase割り当て

以下はPhase 4完了後の会話で出た検討事項で、Phase 5完了時点でも状況は大きく変わっていない。SRS本文にはまだ反映していない、あるいはどのPhaseにも割り当てが確定していないものなので、次にPhase構成を見直すタイミングで扱いを決めること。

### 1. どのPhaseにも未割り当てのSRS要件

- **グループチャットUI（FR-4）：** DB・RLSはグループ対応済みだが、`app/chat/[roomId]/page.tsx`・`get_conversation_list`はいずれも「DM相手1人」前提のまま実装されている。`HomeTabs`にグループタブの見た目だけは用意した（disabled）。Phase割り当ては引き続き未決定
- **テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）：** 画像アップロード失敗時の手動リトライ（選択中の画像・本文を保持したまま再送信可）はPhase 4で対応済みだが、テキスト送信そのものの自動リトライは未実装・未割り当て
- **真の楽観的更新**（送信直後に仮IDで即座に表示 → サーバー確定後に差し替え）：Phase未割り当てのまま。体感速度に関わるため、Phase 7「低スペック最適化」とまとめるのが良さそうという話が出ている

### 2. 複数チャットレイアウト対応（新規アイデア・未実装）

本人からの提案：現在のLINE風（自分は右・相手は左、吹き出し）以外に、Discord風（全員左揃え、非吹き出し）など、複数のチャットレイアウトから選べるようにしたい。SRS本文には未記載だが、Future Extensions「UIテーマ切り替え」の延長線上のアイデアとして位置づけられる。

**議論の要点：**

- DB設計への影響はほぼなし。`messages`テーブルの構造は変わらず、`components/chat/MessageBubble.tsx`など表示層コンポーネントの差し替えだけで実現できる
- 低スペック端末への影響もほぼゼロ（CSS/DOM構造の違いのみ）。SRSの軽量設計方針と矛盾しない
- **グループチャットUI（上記1.）との相性を考慮すべき。** Discord風レイアウトは「誰が発言したか」を毎メッセージに表示する前提の設計であり、現状は1対1 DMのみなので価値が出にくい。グループチャットUI実装後に着手するのが自然という結論になった
- 最初から汎用的な「レイアウトプラグイン機構」のように作り込むのは、このアプリの規模に対して過剰設計。まずはLINE風・Discord風の2種類の切り替えだけ実装し、3種類目以降は後から追加コンポーネントとして足していく方針でよい、という方向性で合意
- 設定の保存場所は`user_settings`に新カラム（例：`chat_layout`）を追加する形が、既存の`dm_from_stranger_enabled`等と同じパターンで自然。ルーム単位ではなくユーザー単位の設定にする想定

**Phase位置づけの見立て：** グループチャットUI実装後、Phase 7の仕上げか独立Phaseとして検討。今すぐ決定する必要はない。**現時点では実装しないこと。**

**`docs/srs.md`への反映：** 未実施。Future Extensionsの「UIテーマ切り替え」を「UIテーマ・チャットレイアウト切り替え」のように具体化する案が出ているが、実際に編集するかはユーザーの判断待ち。

## 開発上の重要な原則

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する
- **MXバイパス：** `signUp()`は使わず`adminClient.auth.admin.createUser()` + `email_confirm: true`を使う
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`を忘れずに実行する
- **トリガーの`search_path`：** authスキーマ配下から実行されるトリガー関数は`SET search_path = public`が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せずSupabaseクライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する（Cloudinaryの署名発行も同じ原則。ただしファイル本体はRoute Handlerを経由させず、ブラウザから直接Cloudinaryへ送る）。一覧系の複雑な集計（Phase 5の`get_conversation_list`等）はRPC（SECURITY DEFINER関数）に寄せてN+1を避ける
- **Realtime対象テーブルの登録を忘れない：** 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れずに行う
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する。ジェネリクス・JSXなど`<`を含む長いコードはチャットのコードブロックではなくファイルとして渡す。可能な場合はサンドボックスに同一構成のプロジェクトを再構築し`tsc --noEmit`で検証してから渡す
- **コミット：** Conventional Commits形式でコミットする
- **破壊的変更の確認：** Next.js等のバージョン依存の仕様に不安がある場合、AGENTS.mdの指示通り実物のドキュメント（npmパッケージから取得可能）またはWeb検索で確認してからコードを書く

## ファイル構成（Phase 13時点）

```
tiliq-chat/
├── app/
│   ├── layout.tsx              # フォント・メタデータ・PWA設定・Service Worker登録/オフラインバナー/インストール導線（Phase 7）
│   ├── page.tsx                 # アプリ紹介ページ（SRS 3.2.1。Phase 8でログイン/サインアップ導線を追加）
│   ├── error.tsx                # 汎用エラー画面（SRS 3.4。Phase 9・新規）
│   ├── global-error.tsx         # ルートレイアウトクラッシュ時の最終防衛ライン（Phase 9・新規）
│   ├── not-found.tsx            # ブランド準拠の404画面（Phase 9・新規）
│   ├── globals.css              # デザイントークン・Tailwind v4設定
│   ├── favicon.ico
│   ├── api/
│   │   └── cloudinary/
│   │       └── sign/route.ts    # Cloudinary署名発行（Phase 4）
│   ├── login/page.tsx           # ログイン画面（Phase 2）
│   ├── signup/page.tsx          # サインアップ画面（Phase 2）
│   ├── settings/page.tsx        # 追加認証・通知・DM受信設定画面（Phase 6。Phase 7で通知設定・DM受信設定を統合）
│   ├── home/page.tsx            # チャット一覧画面（Phase 3。Phase 5でタブ+ユーザー追加パネル、Phase 6で起動時ゲート分岐、Phase 7でStrangerDmToggleを設定画面へ移設、Phase 8で取得エラー伝播、Phase 9でFR-15レスポンシブレイアウトの外枠を追加）
│   ├── chat/[roomId]/
│   │   ├── page.tsx             # チャット画面（Phase 3。Phase 5でブロック状態取得、Phase 6で各チャットゲート分岐・非表示ID取得を追加）
│   │   └── hidden/page.tsx      # 非表示メッセージ一覧（Phase 6・新規）
│   └── actions/
│       ├── auth.ts              # signup/login/logout Server Actions（Phase 2）
│       ├── auth-secret.ts       # 追加認証（PIN/キー）設定・検証系 Server Actions（Phase 6・新規）
│       ├── rooms.ts             # startDirectMessageWithUser（Phase 5）+ toggleRoomAuthRequired/closeTempChat/startTemporaryDirectMessage（Phase 6）（Phase 8でデッドコードのstartDirectMessageを削除）
│       ├── friends.ts           # フレンド申請系 Server Actions（Phase 5。removeFriendはPhase 8でHomeTabs.tsxから呼び出し開始）
│       ├── blocks.ts            # ブロック系 Server Actions（Phase 5）
│       ├── messages.ts          # deleteMessage/hideMessage/unhideMessage（Phase 6・新規）
│       └── settings.ts          # dm_from_stranger_enabled（Phase 5）+ auth_scope_launch/hidden_list更新（Phase 6）+ updatePushNotificationsEnabled（Phase 7）
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # ブラウザ用クライアント
│   │   ├── server.ts            # Server Component/Action用クライアント
│   │   └── admin.ts             # service_role用クライアント
│   ├── cloudinary/              # Phase 4
│   │   ├── sign.ts              # 署名生成（サーバー専用）
│   │   ├── upload.ts            # クライアント→Cloudinary直接アップロード
│   │   └── url.ts               # 表示用URL変換ヘルパー
│   ├── images/
│   │   └── compress.ts          # 送信前バリデーション・リサイズ（Phase 4）
│   └── errors.ts                # Server Action呼び出し失敗時の共通エラーメッセージ（Phase 8・新規）
├── components/
│   ├── TiliquaMark.tsx          # ブランドロゴ
│   ├── auth/
│   │   └── AuthGate.tsx         # 追加認証の共通ゲート（Phase 6・新規。Phase 8でtry/catch化）
│   ├── settings/
│   │   ├── AuthSettingsForm.tsx        # PIN/キー設定・スコープトグルフォーム（Phase 6・新規。Phase 8でtry/catch化・PIN入力属性追加）
│   │   └── NotificationSettingsForm.tsx # 通知設定・DM受信設定フォーム（Phase 7・新規。Phase 8でtry/catch化・エラー表示追加）
│   ├── pwa/                     # Phase 7・新規ディレクトリ
│   │   ├── ServiceWorkerRegistrar.tsx  # Service Worker登録（何も描画しない）
│   │   ├── OfflineBanner.tsx           # SRS 3.4オフラインバナー
│   │   └── InstallPrompt.tsx           # PWAインストール導線（beforeinstallprompt+iOSフォールバック）
│   ├── chat/
│   │   ├── ChatRoom.tsx             # チャット画面本体・Realtime購読・画像添付・ブロックUI・削除/非表示・オプションメニュー（Phase 3/4/5/6。Phase 8でtry/catch化・空状態・日付区切り等のUX修正）
│   │   ├── MessageBubble.tsx        # メッセージ表示・長押し/右クリックメニュー（Phase 3/4/6。Phase 8で画像alt修正、Phase 9でキーボード操作対応を追加）
│   │   ├── ChatRoomOptionsMenu.tsx  # チャットオプションメニュー（Phase 6・新規。Phase 8でtry/catch化・確認ダイアログ追加）
│   │   ├── GatedChatRoomLoader.tsx  # 各チャットゲート有効時のクライアント側取得（Phase 6・新規。Phase 8でメッセージ取得エラー処理を追加）
│   │   └── HiddenMessagesList.tsx   # 非表示メッセージ一覧本体（Phase 6・新規。Phase 8でtry/catch化・画像alt修正）
│   └── home/                    # Phase 5・新規ディレクトリ
│       ├── HomeTabs.tsx         # フレンド/ストレンジャー/グループタブ・一時チャットバッジ（Phase 5/6。Phase 8でフレンド解除ボタン・取得エラー表示、Phase 9でFR-14検索フィルタ・レスポンシブレイアウト対応を追加）
│       ├── AddUserPanel.tsx     # ユーザー検索・フレンド申請・簡易ブロック・一時チャット期限選択（Phase 5/6。Phase 8でtry/catch化・ESLintエラー解消・検索0件表示、Phase 9でFR-15レスポンシブ配置（PCサイドバー/スマホボトムバー）、Phase 13でPC常時展開を追加）
│       └── HomeContent.tsx      # 起動時ゲート有効時のクライアント側取得（Phase 6・新規。Phase 8で取得エラー処理、Phase 10でfriendshipsのRealtime購読を追加）
├── types/
│   └── supabase.ts              # Supabase生成型定義（Phase 3で導入、Phase 5/6で再生成）
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
│   └── sw.js                    # 最小構成Service Worker（Phase 7・新規）
├── docs/
│   ├── srs.md                   # 要件定義（正。Phase 8でlock_type/lock_secret・auth_requiredの記載を実態に合わせて更新）
│   └── schema.sql               # DBスキーマ参照用ファイル（Phase 6のRPC・列、Phase 8のanon revokeを追記）
├── proxy.ts                     # ルート保護・セッションリフレッシュ（Phase 2。Phase 7でmatcherにsw.js除外を追加）
├── next.config.ts               # 画像remotePatterns（Phase 4）+ sw.js用headers（Phase 7）
├── .env.example                 # Phase 8で未使用のNEXT_PUBLIC_APP_URLを削除
└── CLAUDE.md（このファイル）
```

（`components/chat/NewDmForm.tsx`はPhase 5で`AddUserPanel`に統合されたため削除済み。`components/home/StrangerDmToggle.tsx`はPhase 7で`NotificationSettingsForm`に統合されたため削除済み。`app/actions/rooms.ts`の`startDirectMessage`関数はPhase 8でデッドコードとして削除済み）

## 次にやること（Phase 14・未確定）

Phase 13（ユーザー追加パネルをPCで常時展開に変更）は完了し、実装内容は「Phase 13 の実装内容・詳細」セクションに記録済み。次のPhaseの内容はまだ確定していない。以下は候補（優先度未確定）。ユーザーから「許可不要で計画→実装を繰り返してよい、コミットも自由に行ってよい」との承認済み（2026-08-12）のため、次回セッションでは基本的にこのリストから妥当なものを選んで自律的に進めてよい：

1. **Phase 9の持ち越し・簡略化事項の残り：** FR-14の「同グループメンバーも検索対象に追加」チェックボックス（グループチャットUI実装後に対応。Phase 13でFR-15の「PCでは常時展開」への調整は対応済み）
2. **`eslint`（9→10）・`typescript`（6.0→7系）のメジャー更新の再挑戦：** Phase 12で判明した通り、`eslint`は`eslint-config-next`同梱の`eslint-plugin-react`がESLint 10のRuleContext API変更に追従するまで、`typescript`は`typescript-eslint`がTypeScript 7.1（2026年秋予定）に対応するまでブロックされている。着手前に必ず`npm view eslint-config-next@latest dependencies`・`npm view typescript-eslint peerDependencies`で状況を再確認し、実際に`npx eslint .`まで動かして検証してから確定すること（詳細は「Phase 12 の実装内容・詳細」参照）
3. **「検討中のアイデア・未確定のPhase割り当て」セクション記載の項目：** グループチャットUI（FR-4）、テキスト送信失敗時の自動リトライ（SRS 3.4）、真の楽観的更新、複数チャットレイアウト対応（LINE風/Discord風）。いずれもPhase未割り当てのまま。グループチャットUIについては「Phase 8 の実装内容・詳細」の持ち越し事項に、現状DB/RLS側で既に許容されている範囲の精緻化メモがある。他の候補より規模が大きく複数セッションに渡る見込みのため、着手する場合はまずスコープを1セッション分に区切ってから進めること
4. **デプロイ（将来）：** Vercelへの本番デプロイ。`.env.example`を参考に環境変数を設定。SRS 2.5「無料プランでの運用を前提とする」を踏まえたVercelプランの確認。他の未実装機能が出揃った段階で着手する方針は変更なし

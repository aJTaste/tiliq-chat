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
| 14    | eslint/typescriptメジャー更新の再チェック（結果：継続ブロック）・テキスト送信失敗時の自動リトライ（SRS 3.4） | **完了** |
| 15    | 地固め総仕上げ：バグ・脆弱性・古い依存の再確認（コード変更なし）＋`docs/srs.md`と実装の乖離解消 | **完了** |
| 16    | eslint/typescript更新の再チェック（結果：継続ブロック）・実機フィードバックのUIバグ3件修正・起動時ゲート中のヘッダー非表示化（セキュリティ/プライバシー対応）・AuthGate表示位置の調整・グループチャットUI M1設計とナビゲーション刷新構想の整理（実装は保留） | **完了** |
| 17    | ナビゲーション構造刷新M1（永続サイドバーシェル）：Route Groups + 共有Layoutで`/home`・`/chat/[roomId]`を統合。起動時ゲートの直接URLバイパスも解消 | **完了** |

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

## Phase 14 の実装内容・詳細

CLAUDE.md「次にやること（Phase 14・未確定）」候補のうち、①eslint/typescriptメジャー更新の再挑戦、②テキスト送信失敗時の自動リトライ（SRS 3.4）の2件を実施。①は調査の結果ブロック状況に変化が無く実装不可と判明したため記録のみ、②は実装まで完了した。

### ①eslint/typescriptメジャー更新の再チェック（結果：継続ブロック・コード変更なし）

Phase 12時点の調査結果を`npm view`等で再確認したが、2026-08-12時点で状況は変わっていなかった：

- **typescript 7系**：`typescript-eslint`（最新8.67.0）の`peerDependencies.typescript`は依然`>=4.8.4 <6.1.0`のまま。加えて、解禁の前提となる**TypeScript 7.1自体もまだリリースされていない**（`npm dist-tags`は`latest: 7.0.2`、`next: 7.1.0-dev.*`のdevビルドのみ）。関連issue [typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)はClosed（Not Planned）
- **eslint 10系**：`eslint-config-next`（16.3.0）が同梱する`eslint-plugin-react@7.37.5`の`peerDependencies.eslint`は`^9.7`まで。ESLint 10のRuleContext API変更への対応PR [#3979](https://github.com/jsx-eslint/eslint-plugin-react/pull/3979)は未マージ（issue [#3977](https://github.com/jsx-eslint/eslint-plugin-react/issues/3977)はOpen）。なお`eslint-plugin-react-hooks`は7.1.1で既にESLint 10へ対応済み（ボトルネックは`eslint-plugin-react`単体）
- `package.json`の変更は無し
- **次回再チェック時の監視ポイント**：`eslint-plugin-react`の新バージョン公開（PR #3979マージ後）、TypeScript 7.1の正式リリース＋`typescript-eslint`の対応リリース。次回セッション開始時は引き続き`npm view typescript-eslint peerDependencies`・`npm view eslint-config-next@latest dependencies`で確認するとよい

### ②テキスト送信失敗時の自動リトライ（SRS 3.4）

SRS 3.4「メッセージ送信失敗時はリトライボタンを表示する（最大3回まで自動リトライ後、手動リトライに切り替え）」に対応。変更ファイルは`components/chat/ChatRoom.tsx`のみ。

**実装内容：**

- `sendMessage()`のDBへのinsert部分を、新設の`insertMessageWithRetry(payload)`ヘルパー経由に変更。初回送信+自動リトライ3回＝計4回まで、指数バックオフ（1秒→2秒→4秒）で待機しながら再試行する
- クライアント側で`crypto.randomUUID()`により`id`を1回だけ生成し、同一メッセージに対する全ての試行（自動・手動リトライ問わず）で使い回す（冪等性の担保）
- 自動リトライを使い切っても失敗した場合、失敗ペイロード（`retryPayload` state）を保持し、入力フォーム下に「送信に失敗しました。［再試行］［取り消し］」のバナーを表示する（SRSの「リトライボタン」に相当）。「再試行」は同一`id`で`insertMessageWithRetry`をもう一度実行し、失敗すればバナーはそのまま残る。「取り消し」は保留ペイロードを破棄する
- リトライ対象は**DBへのinsert失敗のみ**。画像アップロード（Cloudinary）失敗時の挙動（Phase 4実装、手動での選び直し・再送信）は変更していない。テキスト＋画像の組み合わせでinsertが失敗した場合も、画像は既にアップロード済みのURLを`payload.image_url`として保持しているため、リトライ時に再アップロードは発生しない

**設計判断・学び：**

- **冪等性の担保が最大の課題だった。** `messages.id`はDB側の`gen_random_uuid()`任せの設計（Phase 1〜13共通）だったため、素朴に「同じ内容でinsertし直す」実装にすると、ネットワークタイムアウト等でクライアントが失敗と誤認したが実際にはDB側でinsertが成功していたケースで、リトライが同一メッセージを複数保存してしまう危険があった。Realtime購読・ローカルstate双方の重複排除ロジック（`ChatRoom.tsx`）は`id`基準のみで、insertの多重発行そのものは防げない構造だったため、対応として**クライアント側で`id`を1回生成して使い回し、一意制約違反（Postgresエラーコード`23505`）を検出したら該当行を`select`で取得して成功扱いにする**方式にした。`types/supabase.ts`の`messages.Insert`型は`id?: string`で上書き可能、`messages_insert_member_not_blocked`のRLSも`id`を制約していないため、型・DB側とも変更不要だった
- **失敗時に入力欄へ本文を書き戻す既存の挙動（`setInputValue(content)`）は廃止し、専用のリトライバナー方式に一本化した。** SRSが「リトライボタンを表示する」と明記している以上、ユーザーに再入力・再送信させる暫定策よりも、失敗した内容をそのまま保持して再試行できる専用UIの方が意図に近いと判断した
- **保留中の失敗ペイロードは新規送信とは独立させ、`sending`とは別state（`retrying`）で管理した。** ある送信が失敗してバナーが表示されている間も、ユーザーはそのまま新しいメッセージを入力・送信できる（`canSend`の条件に`retryPayload`・`retrying`は含めていない）。ただし保留スロットは1つのみのため、2件目の送信も自動リトライを使い切って失敗した場合はバナーが新しい方の失敗内容で上書きされる（同時に2件の失敗を表示するUIは持たない）。この非対称性は許容する既知の制約として記録する
- **リトライ機構と`OfflineBanner.tsx`（`navigator.onLine`監視）は連携させなかった。** オフライン中に自動リトライが数秒×3回無駄打ちすること自体の実害は小さく、連携させるには`navigator.onLine`監視ロジックの共通フック化という一段のリファクタが必要になるため、SRSに連携必須の明記が無いことも踏まえ過剰設計を避けた（このプロジェクト一貫の判断基準）
- **`MessageBubble.tsx`・`lib/errors.ts`は変更していない。** 送信中/失敗中の状態表示はメッセージバブル単位ではなく、既存の`sendError`と同じ「フォーム直下のインラインエリア」に留めた。バブル単位のpending/failed状態を持たせるには`MessageRow`型（DBの行そのもの）にクライアントオンリーの一時状態を混在させる設計変更が必要になり、影響範囲がRealtime受信・重複排除ロジックにまで広がるため、今回は最小スコープに留めた。`lib/errors.ts`の`NETWORK_ERROR_MESSAGE`はServer Action呼び出し失敗用の文言であり、`sendMessage()`は元々Server Actionを経由しない`{data,error}`パターンのままなので、今回も独自のエラー文言体系のままとした
- **アンマウント対策として`isMountedRef`を新設した。** 指数バックオフの待機中（最大7秒）に別ルームへ遷移する等でコンポーネントがアンマウントされた場合に備え、待機後・insert後の両方で`isMountedRef.current`を確認してからのみ`setState`する

**動作確認してほしい項目（実機確認用チェックリスト）：**

1. DevToolsでネットワークをオフラインにしてメッセージを送信 → 自動的に数秒おきに3回まで再試行された後、「送信に失敗しました。［再試行］［取り消し］」バナーが表示されること
2. オンラインに戻して「再試行」を押す → 送信が成功し、通常通りメッセージ一覧に反映され、バナーが消えること
3. 「取り消し」で保留中の失敗メッセージを破棄できること（バナーが消え、以後何も送信されないこと）
4. 通常のオンライン状態でのテキスト送信・画像付き送信が従来通り成功すること（デグレ確認）
5. Cloudinaryアップロード自体が失敗するケースでは、従来通り自動リトライされず、選択中の画像・本文を保持したまま手動での再送信が必要なままであること（スコープ外の確認）
6. 送信失敗バナー表示中に別の新しいメッセージを入力・送信できること（独立して動作することの確認）

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 上記「動作確認してほしい項目」はユーザーによる実機確認待ち（開発体制上、UIの動作確認はユーザー担当のため）

### 未対応・持ち越し事項（Phase 14時点）

- 保留中の失敗ペイロードは1件分のスロットのみ（上記「設計判断・学び」参照）。複数の送信失敗を同時にバナー表示する設計は見送った
- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中。次回監視ポイントは上記の通り

## Phase 15 の実装内容・詳細

ユーザーからの依頼「とりあえず完成、一旦問題はない、という状態に持っていきたい」を受け、新機能実装ではなく地固めの総仕上げとして実施。**アプリのコード（`app/`/`components`/`lib`等）は一切変更していない。** 実装前に3系統の調査（SRSと実装の差分確認／自動テスト・TODOコメントの残存確認／依存関係の鮮度確認）を並行実行し、既知の技術的負債が本当に「これ以上ない」状態かを再検証してから着手した。

### 調査で確認した内容（2026-08-12時点）

- **バグ・TODO：** `app/`/`components`/`lib`配下にTODO/FIXME/XXX/HACKコメントは0件。`next.config.ts`に`eslint.ignoreDuringBuilds`・`typescript.ignoreBuildErrors`等のビルドエラー無視設定もなし
- **脆弱性：** `npm audit`で脆弱性0件
- **依存関係：** `npm outdated`で残るのは`@types/node`・`eslint`・`typescript`の3件のみで、いずれもメジャーバージョン更新待ち。`eslint`（9→10）・`typescript`（6.0→7系）はPhase 12・14で確認済みの外部ブロッカー（`eslint-plugin-react`のESLint 10未対応、`typescript-eslint`のTypeScript 7未対応。TypeScript 7.1自体も未リリース）が本日時点でも一切変化なし
- **自動テスト：** `package.json`にtestスクリプトなし、jest/vitest/playwright等のパッケージなし、`__tests__`・`*.test.ts(x)`ファイルも0件。**「自動テスト基盤を今回導入するか」をユーザーに確認した結果、従来通り手動QA運用を継続する方針で確定した。** 開発体制（コーディングはClaude、動作確認は本人）とプロジェクト規模を踏まえた意図的な判断であり、見落としではないことをここに明記する
- **`.env.example`：** CLAUDE.md記載の環境変数一覧と完全一致

上記の結果、コード面で「一旦問題はない」と言える状態には既に到達しており、外部ブロッカー起因のもの（eslint/typescript）を除けば着手できる技術的負債は残っていなかった。唯一残っていた実質的なギャップは、プロジェクトが「正」と定める`docs/srs.md`本文が、Phase 5〜9で確定した実装上の設計判断を反映しきれておらず、実装との間に乖離が残っていたことだった。

### `docs/srs.md`の編集（5箇所。実装変更なし、記述の整合のみ）

| 箇所                            | 内容                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 3.2.1 UI（検索タブ）            | 「フレンド・ストレンジャー・グループ・検索の4タブ」→「フレンド・ストレンジャー・グループの3タブ＋ユーザー追加パネル」に修正し、Phase 5での統合判断を注記として追加 |
| 3.1 FR-4・FR-14                 | 表本体の優先度（「必須」）は変更せず、直後に実装状況の注記を新設。FR-4（グループチャット）は未実装・Phase未割り当て、FR-14の「同グループメンバー追加」オプションはFR-4依存で未対応であることを明記 |
| 3.2.3 エラーレスポンス規約      | 「統一する」という記述は残しつつ、実際にはServer Actionsの大半が独自の`{success, error}`形式を返しており、統一形式に準拠するのは`app/api/cloudinary/sign/route.ts`のみであることを注記として追加（アーキテクチャ上の意図的な判断として記録） |
| 3.9 Testing Requirements        | 単体・結合・E2E・非機能テストの節はいずれも自動テストとして未実装であり、`tsc`/`eslint`/クリーンビルドの静的検証＋本人による手動QA（Phaseごとの実機確認チェックリスト）で担保する運用である旨を注記として追加（今回新たに発見した5点目の乖離） |
| 5. Future Extensions            | 「UIテーマ切り替え」を「UIテーマ・チャットレイアウト切り替え（LINE風・Discord風など）」に拡張し、「検討中のアイデア」節にあったチャットレイアウト切り替えの構想をSRS本文にも反映 |

いずれも`lock_type`/`lock_secret`（Phase 8で追加済み）と同じ「※実装状況に関する注記」パターンを踏襲し、要件の優先度・原文自体は書き換えずに実態を追記する形にした。改訂履歴（バージョン1.0/1.1）は、Phase 8のlock_type注記追加時と同様に今回もバージョンを上げていない（軽微な実態追記のため）。

### 設計判断・学び

- **3.9 Testing Requirementsの乖離は計画段階では見落としており、`docs/srs.md`全文を読み返した実装直前の段階で発見した。** 計画時点で洗い出した4項目（検索タブ・FR-4/FR-14・エラー形式・Future Extensions）はいずれもCLAUDE.mdに経緯が記録済みだったため事前調査で把握できていたが、3.9節は「テストを実施する」という定型的な記述のため、CLAUDE.md側に対応する記録が無く見落としていた。実装直前にファイル全体を読み返す一手間が、計画段階の調査だけでは拾いきれない乖離を発見する機会になった
- **自動テスト未導入の是非は、SRS 3.9の存在によって「単なる持ち越し事項」ではなく「SRSが実施すると明言している検証を実施していない」という、ドキュメント整合性の問題そのものだった。** そのためユーザーに改めて意思確認したうえで、srs.md側にも「意図的に見送っている」ことを明記する形にした。これにより、次回以降のセッションが自動テスト不在を「未着手のバグ」と誤認して蒸し返すことを防ぐ
- **FR-4/FR-14の優先度を「必須」のまま据え置いた。** 格下げも検討したが、これらは元々ユーザーが必須と判断した要件であり、実装側の到達状況（未実装）と要件としての優先度（必須）は別軸であるため、`lock_type`と同じく「原文は変えず実態を注記する」方針で統一した

### 検証方法・実施内容

- アプリのコード（`app/`/`components`/`lib`等）は変更していないため、`npx tsc --noEmit`・`npx eslint .`・クリーンビルドは理論上無風だが、`docs/`配下の変更のみであることの再確認を兼ねて実行し、いずれもエラー0件・成功を確認した
- 編集後の`docs/srs.md`を通読し、テーブル区切り（`|`）やコードブロック（```）等のMarkdown構造が崩れていないことを確認した

### 未対応・持ち越し事項（Phase 15時点）

- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中（変化なし）。次回監視ポイントはPhase 12・14の記録を参照
- `rooms.lock_type`/`lock_secret`は列としては未使用のまま残置（Phase 8時点の判断を継続）
- 自動テスト基盤は今回も見送り、手動QA運用を継続する方針で確定（後述「次にやること」にも明記し、蒸し返し防止のため記録）

## Phase 16 の実装内容・詳細

CLAUDE.md「次にやること（Phase 16・未確定）」候補のうち、①eslint/typescriptメジャー更新の再チェックを実施。②グループチャットUI（FR-4）のM1（最小スコープ）設計に着手し、詳細設計（新規RPC・Server Actions・既存ファイルの変更方針）まで固めたが、設計確認のやり取りの中でユーザーから実機フィードバック（具体的なUIバグ複数件、ホーム/チャット画面のナビゲーション構造刷新の構想、その他多数の小粒要望）が寄せられた。ナビゲーション刷新の構想が、グループチャットの一覧・作成UIの置き場所そのものに直結するため、**グループチャットUI M1の実装は保留**し、今回のセッションでは③原因を特定できた具体的UIバグ3件の修正と、④今回判明した内容全体のバックログ整理に着地させた。

### ①eslint/typescriptメジャー更新の再チェック（結果：継続ブロック。ただしeslint側で進展あり）

Phase 12・14時点の調査結果をnpmレジストリ・GitHub issue/PRで再確認した（2026-08-12）：

- **typescript 7系：** `typescript-eslint`（最新8.67.0）の`peerDependencies.typescript`は依然`>=4.8.4 <6.1.0`のまま。前提となる**TypeScript 7.1自体も未リリース**（`npm dist-tags`は`latest: 7.0.2`、`next: 7.1.0-dev.20260812.1`のdevビルドのみ）。typescript-eslint#12518はClosed（Not Planned）のまま。派生issue#12521（TS7検出時のエラーメッセージ改善提案）もClosedだが、これはTS7サポート追加の話ではないことを確認済み。`@typescript/typescript6`という互換パッケージ（TS7環境でTS6.0 APIを再エクスポート）が登場しているが、`tsc`本体のプログラム的呼び出し向けの回避策であり、typescript-eslint側のpeer依存範囲（`<6.1.0`）自体を解消するものではない
- **eslint 10系：** `eslint-plugin-react`最新は依然7.37.5（`peerDependencies.eslint`は`^9.7`まで、`eslint-config-next`最新/preview/canary版いずれも同梱バージョン変わらず）。**ただし進展あり：** ESLint 10のRuleContext API変更への対応PRが、当初の#3979から後継の**PR #4022**（2026-07-30オープン）に引き継がれており、レビュアー承認済み・独立検証（ESLint 9.39.4と同一の1,229件の指摘・18ルールで挙動一致を確認済み）も完了した「マージ待ち」段階まで進んでいる（issue #3977はOpenのまま）
- `package.json`の変更は無し
- **次回再チェック時の監視ポイント：** `npm view eslint-plugin-react@latest version`で7.37.5から更新されていないか（PR #4022マージ後を想定）、TypeScript 7.1の正式リリース＋`typescript-eslint`の対応リリース

### ②〜④ 実機フィードバックのUIバグ3件修正

変更ファイルは`components/auth/AuthGate.tsx`・`components/home/AddUserPanel.tsx`のみ。

**②`/home`の起動時認証ゲート（AuthGate）がPC画面で極端に左寄りになる**

原因：[components/auth/AuthGate.tsx](components/auth/AuthGate.tsx)のロック中UIのルート`<div>`に横幅指定が無かった。`/chat/[roomId]`では単独でページ全体を返すため`app/layout.tsx`の`<body className="flex flex-col ...">`のstretchで自然に幅いっぱいになるが、`app/home/page.tsx`は`<div className="flex flex-1 flex-col md:flex-row">`で`HomeContent`をラップしており（Phase 9のFR-15対応）、PC幅（`md:flex-row`）では横方向がflexのmain axisになるため、幅指定の無い`AuthGate`が中身の内容幅ぶんしか幅を持たず行の先頭に寄っていた。修正：ルート`<div>`に`w-full`を追加。

**②の追加修正（実機確認で発覚）：`/home`のゲートが`/chat/[roomId]`のゲートよりわずかに下寄りに表示される**

左寄りは解消したが、垂直位置がわずかにズレているとユーザーから報告があった。原因：`/chat/[roomId]`のAuthGateはbody直下（`flex-col`）で`min-h-[50vh]`ぶんの高さのみを占有し画面上部から25%の位置に中央寄せされるのに対し、`/home`はヘッダー（Tiliquaロゴ・ユーザー名・設定/ログアウトボタン。ゲート状態に関わらず常時表示——Phase 6の意図的な設計）が上に常駐する分だけ、AuthGateの開始位置が下にずれる。加えてPC幅（`md:flex-row`）では、AuthGateがデフォルトの`align-items: stretch`により残り高さいっぱいまで縦方向に引き伸ばされる（`min-h-[50vh]`はあくまで下限のため）ため、`/chat/[roomId]`（常に`min-h-[50vh]`ぶんの箱に留まる）とは箱の高さ自体が異なり、中央位置がさらに変わる。修正：ルート`<div>`に`flex-1`を追加し、所属するflexコンテナの残り領域いっぱいまで明示的に伸びるようにした。これにより`/chat/[roomId]`側も（bodyの残り高さ＝ほぼビューポート全体まで）同じ考え方で埋まるようになり、双方とも「自分の直近の親要素が持つ残り領域の中央」に位置する一貫した挙動になる。**ただし`/home`はヘッダーが常時分の高さを占有する設計を維持している以上、その高さぶんの差は原理的に残る**（ヘッダーをオーバーレイ化すれば完全に一致させられるが、それは「ロック中でも設定画面に逃げられる」という別の意図的な設計－Phase 6のパスワード解除後の設定画面リンクと同種の逃げ道－を壊す可能性があるため、今回は変更していない）。

**②のさらなる追加修正（実機確認で発覚）：数学的な中央だと「気持ち下」に見える**

上記の垂直位置調整後、ユーザーから「全体的にもうちょい上に上げてほしい。真ん中過ぎて、感覚的に下にあるように見える」との追加フィードバックがあった。これは`/home`と`/chat/[roomId]`の相対的なズレの話ではなく、`justify-center`による数学的な中央そのものが、人間の知覚上は「やや下」に感じられるという、より一般的な現象への指摘。修正：`justify-center`を廃し、コンテンツ（タイトル・フォーム等）を挟む形で上下に空の`<div>`を2つ配置し、`flex-[2]`（上）・`flex-[3]`（下）という不均等な比率で余白を分配する方式に変更した。これにより、コンテンツの中心は数学的な中央よりも上（残り余白の40%の位置）に来るようになる。この方式はビューポート・コンテンツいずれの高さが変わっても比率で位置が決まるため、`min-h-[50vh]`のままの`/chat/[roomId]`・`flex-1`で伸びる`/home`のどちらでも同じ見え方になる（`/home`のヘッダー分のズレという上記の話とは独立して効く）。

**③ユーザー検索結果の「メッセージ」「ブロック」等のボタンが枠からはみ出す**

原因：[components/home/AddUserPanel.tsx](components/home/AddUserPanel.tsx)の検索結果1件ぶんのアクション群コンテナ（`flex shrink-0 flex-wrap items-center gap-1.5`）。最大5要素（有効期限セレクト・カスタム入力・フレンド申請/申請中・メッセージ・ブロック）が入りうるところ、`shrink-0`によりこの要素自体がPC版サイドバー幅（`md:w-72`）を超えたまま縮まらず、内側の`flex-wrap`も自身が幅制約を受けない限り機能しないため、`<li>`の角丸ボーダーの外にはみ出していた。修正：`shrink-0`を`w-full`に置き換え、行いっぱいの幅を取らせることで内側の折り返しが正しく機能するようにした。

**④フレンド申請を送った相手に、承認されるまでメッセージを送れない（ボタンが消える）**

原因：`friendshipStatus === "pending_sent"`のときだけ「メッセージ」ボタンが「申請中」というテキストに**排他的に置き換わって**しまっていた。DM開始（`get_or_create_dm_room`）はフレンド関係を要求しないため、UI側だけの見落としだった。修正：「申請中」ラベルと「メッセージ」ボタンを併存させ、フレンド状態に関わらず常にメッセージボタンを表示するよう分岐を再構成した。

### ⑤ グループチャットUI M1の設計、ナビゲーション刷新構想とその他要望のバックログ整理

グループチャットUI M1（新規RPC`create_group_room`/`get_group_conversation_list`、`app/chat/[roomId]/page.tsx`・`GatedChatRoomLoader.tsx`・`ChatRoom.tsx`・`MessageBubble.tsx`・`HomeTabs.tsx`の変更、新規`CreateGroupPanel.tsx`を含む設計）は完了させたが実装はしていない。ユーザーからのフィードバック（ナビゲーション構造刷新の構想、その他小粒要望）を含め、詳細はすべて下記「検討中のアイデア・未確定のPhase割り当て」節の3.・4.に整理した（設計の要約も1.に追記）。

### ⑥ `/home`起動時ゲート：ロック中はヘッダーを一切表示しないよう変更（セキュリティ/プライバシー対応）＋AuthGate表示位置のさらなる調整

継続した実機フィードバックで2件の追加指摘があり対応した。

**1点目（実質的なセキュリティ/プライバシーの穴）：** `/home`のヘッダー（Tiliquaロゴ・ユーザー名・「設定」「ログアウト」リンク）は、Phase 6以来「低感度な情報だから」という理由でゲート状態に関わらず常時表示されていた。しかしこれには2つの実害があった：①ユーザー名という「このアカウントの持ち主が誰か」を示す情報が、ロック中でも（＝端末を借りた・拾った第三者にも）見えてしまう、②「設定」リンクから`/settings`へ遷移でき、そこで認証（PIN/キー）自体を無効化・変更できてしまう——**ロック機能そのものをバイパスできる実質的な穴だった**。

対応：ヘッダーの描画を`app/home/page.tsx`（Server Component、常時描画）から`components/home/HomeContent.tsx`の`GatedHomeBody`（Client Component、`AuthGate`解錠後にのみ描画される経路）へ完全に移した。新規`components/home/HomeHeader.tsx`に切り出し、非ゲート時は`app/home/page.tsx`から、ゲート時は`GatedHomeBody`から使う（表示内容・スタイルは同一）。あわせて`app/home/page.tsx`は、ゲート有効時は`profiles`テーブル（`display_name`）を一切クエリしないよう分岐を先頭に移動した（RSCペイロードに解錠前のユーザー名が一切乗らないようにするため。会話一覧等と同じ既存の防御方針をプロフィール表示名にも適用した）。`GatedHomeBody`側は`display_name`もPromise.allに追加してクライアント側で解錠後に取得する。

**この変更の副次効果：** ロック中の`/home`は`AuthGate`のみを描画する（ヘッダーが無くなった）ため、`main`要素の唯一の子要素になり、`/chat/[roomId]`（bodyの唯一の子要素）と全く同じ「残り高さいっぱいまで`flex-1`で伸びる」box constraintになった。これにより、②の「`/home`と`/chat/[roomId]`で縦位置が微妙にズレる」問題（前回記録した「ヘッダー常時分の高さの差」）も、ヘッダー自体を無くしたことで実質的に解消された。

**なお、ロック中でもPIN/キーを忘れた場合の救済手段は失われていない：** `AuthGate`は5回連続失敗後に「アカウントのパスワードで解除する」という、実際のログインパスワードによる再認証フローを既に持っている（Phase 6実装）。解除後は`AuthGate`自身が`/settings`へのリンクを表示する。ヘッダーからの直接リンクという“ノーガード”な経路を無くしても、パスワードという正規の認証を経由した救済経路は維持されている。

**2点目：** 前回の`flex-[2]`/`flex-[3]`という比率調整後も「まだ真ん中に近くて下に見える」との指摘があり、比率を`flex-[1]`/`flex-[2]`（上寄りをさらに強める）に変更した。1点目の副次効果（`/home`と`/chat/[roomId]`のbox constraintが揃ったこと）とあわせて、両ページで一貫した、より上寄りの表示になる。

### 設計判断・学び

- **設計確認のための質問（グループ作成UIの設置場所）から、当初の想定より大きい情報（複数の実機バグ、ナビゲーション構造刷新の構想）が返ってきた。** グループチャットUI M1は詳細設計まで完了していたが、ナビゲーション刷新の構想が「グループ・一時チャットの作成UIをサイドバーの＋アイコンに集約し、会話一覧をフレンド/ストレンジャー/グループ横断で表示する」という、M1で設計した「`/home`の『グループ』タブ内に閉じた作成UI」という置き場所そのものと競合することが判明した。着手済みの詳細設計を実装に直結させず、いったん立ち止まって保留を選んだ判断は、Phase 8「新機能や依存関係更新まで一緒くたにしない」という既存方針の延長線上にある
- **ナビゲーション構造の刷新（今回の新規構想）と、Future Extensionsに既にある「複数チャットレイアウト対応」（LINE風/Discord風というメッセージ吹き出しの見た目の話）は別物。** 名称が紛らわしいため、CLAUDE.md「検討中のアイデア」節で明示的に区別して記録した
- **Next.js App Routerの共有レイアウト（ルートグループ）機構について、実物のドキュメントでの裏取りはまだ行っていない。** 今回のfeasibility回答は一般的なApp Routerの設計思想に基づく評価であり、AGENTS.mdの方針（実装前に実物のドキュメントを確認する）に従い、実際に着手する際は`node_modules/next/dist/docs/`で本フォークの挙動を確認すること
- **AuthGateの`w-full`修正は、`/home`・`/chat/[roomId]`・`/chat/[roomId]/hidden`のいずれの埋め込み先でも安全に効く汎用的な修正にした。** 埋め込み先ごとに条件分岐したスタイルを持たせるのではなく、コンポーネント自身が常に親幅いっぱいを取るようにすることで、将来別の場所に`AuthGate`を追加しても同種の不具合が再発しない設計にした
- **「ロック中でもヘッダーだけは表示する」というPhase 6の設計判断を、実機フィードバックを受けてPhase 16で覆した。** Phase 6時点では「profile・自分の設定は低感度」という前提だったが、実際に動くものを見たユーザーから「設定変更が可能・ユーザー名が漏れる」という具体的な実害の指摘を受け、判断が変わった。過去のCLAUDE.mdの記録（設計判断）は「その時点で妥当と判断した理由」であって未来永劫の正しさを保証するものではなく、実機フィードバックで覆ることがあるという実例として残す
- **「ヘッダーはRSCペイロードに含めない」対応は、会話一覧・メッセージ本体に対してPhase 6から既にあった防御パターン（AuthGate解錠前はサーバーから取得しない）を、今回プロフィール表示名にも一貫して適用しただけ。** 新しいパターンを持ち込んだわけではない
- **ロック中に「設定」への導線が失われても、パスワードによる正規の解除フロー（Phase 6実装）経由の救済手段は維持されている。** ため、今回の変更は「利便性を犠牲にセキュリティを取った」というより「不要に開いていた抜け道を塞いだ」に近い

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）

### 動作確認してほしい項目（実機確認用チェックリスト）

1. PC幅で起動時認証を有効にしたアカウントで`/home`を開き、認証入力フォームが左寄りでないこと、体感として画面の真ん中よりやや上に表示されることを確認する。スマホ幅、および`/chat/[roomId]`の各チャットゲートでも同様の位置に表示され、`/home`とほぼ同じ高さに見えることを確認する
2. PC幅でユーザー検索を行い、有効期限セレクトや複数ボタンが表示されるケース（フレンドでない相手の検索結果）で、ボタン群がサイドバー幅内に収まり、必要に応じて折り返して表示されること（枠からはみ出さないこと）
3. フレンド申請を送った直後（相手が未応答＝「申請中」表示のとき）でも「メッセージ」ボタンが表示され、クリックしてDMを開始できること。フレンド承認後・非フレンド関係（申請前）でも従来通り動作すること（退行確認）
4. **（最重要）** 起動時認証を有効にしたアカウントで`/home`を開き、ロック中の画面に「Tiliqua」ロゴ・ユーザー名・「設定」「ログアウト」が一切表示されないことを確認する。正しいPIN/キーを入力して解錠すると、ヘッダーとユーザー名が現れることを確認する
5. ロック中に`/settings`へ直接URLを打ち込んでアクセスしようとした場合の挙動を確認する（ページ自体はログイン済みなら開けてしまう想定だが、`/home`の通常導線からは到達できなくなっていることの確認が主目的）。PINを5回連続で間違え、「アカウントのパスワードで解除する」からログインパスワードで解除できること、解除後は従来通り設定画面へのリンクが表示されることも確認する（既存のPhase 6動作の退行確認）

### 未対応・持ち越し事項（Phase 16時点）

- `/home`のヘッダー非表示化により`/home`・`/chat/[roomId]`のゲートのbox constraintが揃ったため、両者の縦位置の差は実質的に解消された想定（旧・持ち越し事項だった「ヘッダー高さぶんの差」は対応済み）。実機での最終確認待ち
- `/chat/[roomId]`・`/chat/[roomId]/hidden`のゲートには「ロック中は何も見せない」設計は元々適用済み（Phase 6由来）だが、今回`/home`のヘッダーを同様に隠したことで、3スコープすべてで「ロック中は本当に何も分からない」という一貫した挙動になった
- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中。eslint側は`eslint-plugin-react`の対応PR #4022がマージ待ち段階まで進んでいるため、次回は`eslint-plugin-react`の新バージョン公開有無から確認するとよい
- グループチャットUI M1は詳細設計のみ完了・実装は保留（下記「検討中のアイデア」節参照）。着手にはナビゲーション構造刷新の方向性決定が先行する
- ナビゲーション構造刷新（永続サイドバーシェル）は構想の記録・feasibility評価のみで、設計・実装は未着手
- 今回追加で判明した小粒要望群（ホームへ戻るUI、一時チャットの命名・複数保持・チャット画面からの作成、スクロールバー、プロフィール概念、既読機能、タブUI統一方針）はいずれも未対応・Phase未割り当て

## Phase 17 の実装内容・詳細

SRS本文には無い、Phase 16で持ち越された「ナビゲーション構造の刷新（永続サイドバーシェル）」に着手。実装前にNext.js実物ドキュメント（`node_modules/next/dist/docs/`）で技術的な裏取りを行い、Explore→Plan agentでの詳細設計→ユーザー確認（「今回は計画だけで終える」との回答）を経て一旦計画のみで区切った後、ユーザーから改めて実装の指示があったため、同じセッション内でM1（骨組み）まで実装した。

### 技術方針（実物ドキュメントで裏取り済み）

- **Route Groups + 共有Layout**（`app/(shell)/layout.tsx`）を採用。`layout.md`に「Layouts preserve state, remain interactive, and do not rerender」と明記されており、`<Link>`でのクライアント遷移時にレイアウトは再マウントされない（サイドバーの状態が保持される）。Route Group自体はURLに現れないため`/home`・`/chat/[roomId]`というURLは変わらず、`proxy.ts`のmatcher（pathnameベース）にも影響しない
- **Parallel Routesは不採用**。`authentication.md`に「A layout also does not control whether the rest of the route renders...does not stop them from running or from appearing in the RSC Payload」と明記されており、非表示スロットもサーバー実行されRSCペイロードに含まれてしまう。これは「ロック中は何も取得しない」という既存のAuthGate設計と衝突するため、単純なRoute Groups + 共有Layoutを選んだ
- 上記と同じ`authentication.md`の記述は、共有layoutで`{children}`を条件分岐で出し分けても子（page）のサーバー側データ取得までは止められないことも意味する。これが後述の「起動時ゲートの直接URLバイパス修正」の設計根拠になっている

### 実装内容

1. **ディレクトリ構造の変更**：`app/home/page.tsx`→`app/(shell)/home/page.tsx`、`app/chat/[roomId]/page.tsx`→`app/(shell)/chat/[roomId]/page.tsx`（`git mv`で移動）。`app/chat/[roomId]/hidden/page.tsx`は`(shell)`に含めず現状の場所のまま（`HiddenMessagesList.tsx`は`/settings`と同じ「自己完結した独立画面」として設計されており、サイドバーと並べる動機がないため。URLも重複しないため技術的な問題もない）
2. **`app/(shell)/layout.tsx`（新規）**：サイドバー（`AddUserPanel`+`HomeTabs`）のデータ取得責務を旧`app/home/page.tsx`から移設。起動時ゲート有効時は`<AuthGate scopeKey="launch"><GatedShellBody>{children}</GatedShellBody></AuthGate>`、無効時は`HomeHeader`＋`ShellFriendshipsSync`＋`ShellRow`（サイドバー＋`{children}`）を描画する
3. **`components/shell/`（新規ディレクトリ）**：
   - `ShellRow.tsx` — サイドバー/メインの`md:`分割。`useSelectedLayoutSegment()`（URL由来でサーバー・クライアント一致、ハイドレーション不一致の心配なし）で`segment === "chat"`かどうかを判定し、モバイル幅ではサイドバーかメインコンテンツのどちらか一方のみをフルスクリーン表示する（従来のページ遷移的な見た目を維持）
   - `GatedShellBody.tsx` — 旧`components/home/HomeContent.tsx`の`GatedHomeBody`を移設・拡張。`children: ReactNode`を追加で受け取りサイドバーと並べて描画する
   - `ShellFriendshipsSync.tsx` — 旧`HomeContent.tsx`の非ゲート時friendships購読effectを切り出したもの
4. **`app/(shell)/home/page.tsx`**：サイドバーの責務が全てlayoutへ移ったため、Supabase呼び出し不要な静的プレースホルダ（「会話を選択してください」）に縮小
5. **`components/home/HomeContent.tsx`を削除**（ロジックは2.・3.へ移設済み）
6. **`components/chat/ChatRoom.tsx`**：ルート要素を`h-screen`から`h-full min-h-0 flex-1`に変更（`ShellRow`のメイン枠の子として残り高さいっぱいに広がる形にするため）
7. **`app/(shell)/chat/[roomId]/template.tsx`（新規）**：後述「roomId切り替え時の強制リマウント」対応
8. **`app/(shell)/chat/[roomId]/page.tsx`**：起動時ゲートの独立チェックを追加（後述「直接URLバイパスの解消」）

### 設計判断・学び

- **roomId切り替え時の強制リマウントが新たに必要になった。** サイドバーが常時表示になったことで、「チャットA表示中にサイドバーから直接チャットBへ遷移する」という、今までのUIには存在しなかった操作が可能になった。`ChatRoom.tsx`は`useState(initialMessages)`等、初回propsからのみ状態初期化する設計のため、対策が無いとBに切り替えたのにAの内容が残る実害がありうる。より深刻なのは`AuthGate.tsx`：sessionStorage確認が`useEffect(() => {...}, [])`（マウント時1回のみ）のため、`scopeKey`が`room:A`→`room:B`と変わってもコンポーネントが再マウントされない限り再チェックされず、**ロック中のBが、直前に解錠したAの解錠状態のまま見えてしまうセキュリティ上のリスクになりうる**ことが実装前の設計検討で判明した。`template.md`（Next.js実物ドキュメント）に「`layout.js`はルート間で状態を保持するが、`template.js`は動的パラメータが変わるごとに一意なkeyでリマウントされる」と明記されていることを根拠に、`app/(shell)/chat/[roomId]/template.tsx`という空実装のファイルを新設して対処した。この方式なら`AuthGate.tsx`自体は無改修で済む（他2スコープ（起動時・非表示一覧）で使い回している共通コンポーネントに手を入れずに済むため、`key={roomId}`を各呼び出し箇所へ個別に付与する代替案よりもこちらを採用した）
- **起動時ゲートの直接URLバイパスを解消した。** 従来`/chat/[roomId]`は独自の「起動時」ゲートチェックを一切持っておらず、ルーム個別の`auth_required`がオフの場合、起動時ゲートが有効でも直接URLで素通りできてしまう抜け道があった（`/home`経由の遷移でしか起動時ゲートが効いていなかった）。共有layout側の`AuthGate`はUI表示（サイドバー）を守るだけで子の実行までは止められないため、`app/(shell)/chat/[roomId]/page.tsx`自身にも`user_settings.auth_scope_launch`の独立チェックを追加し、`needsGate = launchGateEnabled || myMembership.auth_required`で合成判定するようにした。ルーム個別ロックがオンなら従来通り`room:{roomId}`スコープ、オフで起動時ゲートだけが有効なら`launch`スコープを再利用する。sessionStorageキーが共有されるため、シェル側で既に解錠済みのタブでは体験上プロンプトが再度出ることはない（二重チェックだが二度手間にはならない）
- **`/chat/[roomId]/hidden/page.tsx`にも同型の起動時ゲートバイパスが存在するが、今回は対象外とした。** ユーザーが直接指摘したのは`/chat/[roomId]`のみであり、`hidden`側は今回の永続サイドバーシェル化とは独立した問題のため、次回セッションでの対応候補として持ち越す
- **高さ制約の設計**：シェルのルート（`app/(shell)/layout.tsx`の各分岐の最外周div）を`h-screen overflow-hidden`にし、`overflow-hidden`はそこだけに留めた（`ShellRow`等の中間層は`min-h-0`のみ）。中間層にまで`overflow-hidden`を広げると`ChatRoomOptionsMenu`の`absolute`ドロップダウン等が意図せずクリップされる恐れがあるため
- **サイドバー内部（`AddUserPanel.tsx`・`HomeTabs.tsx`）の中身は一切変更していない。** 既存の「検索パネル＋タブ一覧」の見た目・挙動をそのまま`ShellRow`の`sidebar`スロットへ移設しただけ。「検索⇄一覧」のトグル切り替えUIや「＋」新規作成メニューといった内部再設計は明示的にスコープ外とし、次回以降のセッションに残した
- **DBスキーマ・RPC・Server Actionの変更は一切不要だった。** `user_settings.auth_scope_launch`を既存のまま1箇所多く読むだけで済んだ。`app/actions/rooms.ts`の`redirect(\`/chat/${roomId}\`)`もURLが変わらないため無改修で動作する

### 変更・新規ファイル一覧

- 新規：`app/(shell)/layout.tsx`、`app/(shell)/chat/[roomId]/template.tsx`、`components/shell/ShellRow.tsx`、`components/shell/GatedShellBody.tsx`、`components/shell/ShellFriendshipsSync.tsx`
- 移動：`app/home/page.tsx` → `app/(shell)/home/page.tsx`（大幅縮小）、`app/chat/[roomId]/page.tsx` → `app/(shell)/chat/[roomId]/page.tsx`（起動時ゲート判定を追加）
- 変更：`components/chat/ChatRoom.tsx`（ルート要素の高さ指定のみ）
- 削除：`components/home/HomeContent.tsx`
- 無変更：`components/home/AddUserPanel.tsx`・`HomeTabs.tsx`・`HomeHeader.tsx`、`components/auth/AuthGate.tsx`、`components/chat/GatedChatRoomLoader.tsx`、`proxy.ts`、`app/actions/*`、DBスキーマ

### 検証方法・実施内容

- 各ステップ（骨組み移動→共有layout本実装→ChatRoom調整→起動時ゲート組み込み→直接URLバイパス解消）ごとに`npx tsc --noEmit`・`npx eslint .`・`rm -rf .next && npm run build`を実行し、いずれも段階的にエラー0件・成功を確認した
- Route Group移動後も`/home`・`/chat/[roomId]`というURLが変わらないこと、ビルド出力のRouteテーブルに現れることをクリーンビルドの出力で確認した
- Parallel Routes不使用のため、Next.js 16で必須化された`default.js`不足によるビルドエラーは発生しないことを確認済み（実際に発生しなかった）

### 動作確認してほしい項目（実機確認用チェックリスト）

1. デスクトップ幅：`/home`でサイドバー＋「会話を選択してください」のプレースホルダが並んで表示される
2. デスクトップ幅：サイドバーの会話をクリック→サイドバーが保持されたままメインエリアがチャットに切り替わる、URLが`/chat/[roomId]`になる、ブラウザの戻る/進むが正しく動く
3. デスクトップ幅：チャットA表示中にサイドバーから直接チャットBへクリック→メッセージ一覧・入力欄・非表示状態がBのものに正しくリセットされる（Aの内容が残っていない）
4. デスクトップ幅：`/chat/[roomId]`へ直接URLでハードリフレッシュ→サイドバー・チャット両方正しく表示される
5. モバイル幅：`/home`ではサイドバー（検索＋一覧）のみフルスクリーン表示、プレースホルダは見えない
6. モバイル幅：会話タップでチャットのみフルスクリーン表示、サイドバーは見えない
7. **（最重要）** 起動時ゲートON・フレッシュタブ（別ブラウザ/シークレットウィンドウ等）で`/chat/[roomId]`（個別ロック無し）に直接URLアクセス→起動時認証プロンプトが出る（バイパスされないこと）
8. 起動時ゲートONを`/home`側で解錠後、個別ロック無しのルームへ遷移→再プロンプトなしで即座に到達
9. 起動時ゲートON＋ルーム個別ロックON→解錠は別々に必要（launch解錠がroomロックを自動解除しないこと）
10. 3スコープ（起動時／各チャット／非表示一覧）それぞれの既存の解錠・5回失敗ロック・パスワード解除フローに変化がないこと
11. フレンド申請の送受信・承認・拒否・取り消し・Realtime反映がサイドバー化後も動くこと
12. チャット画面のRealtimeメッセージ受信・画像送信・ブロック・削除・非表示・オプションメニューのドロップダウンが正しい位置に表示される（クリップされていない）こと
13. `/settings`・`/chat/[roomId]/hidden`が従来通り単独ページとして開けること

### 未対応・持ち越し事項（Phase 17時点）

- `/chat/[roomId]/hidden/page.tsx`の起動時ゲートバイパスは今回未対応（上記「設計判断・学び」参照）
- サイドバー幅（`md:w-[32rem]`）は暫定値。実機で見てから調整が必要
- サイドバー内部UIの再設計（「検索⇄一覧」トグル切り替え、「＋」新規作成メニュー）は引き続きスコープ外
- グループチャットUI M1の実装は、本シェルの実機確認が済んでから着手する
- モバイルでチャット画面から一覧に戻るUIが無い問題（Phase 16由来のバックログ）は今回もスコープ外のまま
- 「＋」新規作成メニュー導入時にはグループ・一時チャット作成UIの置き場所をサイドバー側へ統合する構想が残っている（CLAUDE.md「検討中のアイデア」節3.参照）

## Phase 18 の実装内容・詳細

CLAUDE.md「次にやること（Phase 18・未確定）」候補2、チャット切り替え時の体感速度改善に着手。Phase 17実機確認で判明していた「`app/(shell)/chat/[roomId]/page.tsx`が最大8回のDB問い合わせを直列`await`している」問題に対応。新機能・挙動変更は無く、DBクエリの発行順序・バッチングのみを変更する純粋なタイミング最適化。

### 変更ファイル

- `app/(shell)/chat/[roomId]/page.tsx`
- `components/chat/GatedChatRoomLoader.tsx`（各チャットゲート有効時のクライアント側読み込み経路。同型の直列クエリを持っていたため同一コミットで対応）

### 実装内容

`app/(shell)/chat/[roomId]/page.tsx`の直列8ステップを、依存関係に基づき4段階に再編した（`app/(shell)/layout.tsx`で既に使われている`Promise.all`+分割代入のパターンをそのまま踏襲）：

1. **Stage 1（`Promise.all`）：** `room`・`myMembership`・`settings`。いずれも`roomId`/`user.id`のみに依存し相互に独立
2. **`needsGate`判定・早期return：** 無改修のまま。trueなら`<AuthGate><GatedChatRoomLoader/></AuthGate>`を返し、Stage 3以降のクエリは一切発行しない
3. **Stage 2（単独）：** `otherMember`（`!needsGate`の場合のみ到達。あえてStage 1に含めなかった理由は後述）
4. **Stage 3（単独、`otherMember`に依存）：** `otherProfile`（既存の三項演算子ロジックのまま）
5. **Stage 4（`Promise.all`）：** `myBlockOfOther`・`initialMessagesDesc`・`hiddenRows`。`otherProfile.id`が要るのは`myBlockOfOther`のみだが、残り2つも一緒に発行して無駄がないためまとめた

`components/chat/GatedChatRoomLoader.tsx`も同様に、`otherProfile`確定後の`myBlockOfOther`・`initialMessagesDesc`（`messagesError`分岐は維持）・`hiddenRows`の3クエリを`Promise.all`にまとめた。

いずれのファイルも`notFound()`/`redirect()`/エラーフォールバック（`?? []`・`?? false`・`messagesError`分岐）の意味は一切変更していない。新たな`.error`チェックも導入していない（既存が全箇所`.data`のnullチェック/フォールバック方式のため、`layout.tsx`の`loadError`パターンをここに持ち込むのはスコープ外の挙動変更になるため見送った）。

### 設計判断・学び

- **`otherMember`をStage 1に含めなかった。** `otherMember`自体は`roomId`/`user.id`のみに依存しStage 1の3クエリと相互に独立しているため、技術的には一緒に束ねられる。しかしStage 1完了後の`needsGate`判定でゲート中と分かった場合、Stage 2以降（`otherMember`含む）は全く発行されないという既存の重要な性質（ゲート中ユーザーへの無駄なDB往復を増やさない。Phase 6以来の設計方針）がある。`otherMember`をStage 1に混ぜると、ゲート中でも常にこのクエリだけは発行されてしまう回帰になるため、あえてStage 2として`needsGate`チェックの後に残した。非ゲート成功パスで1ステップ分の並列化を諦める代わりに、ゲートパスの「余計な仕事をしない」という既存の重要な性質を守った
- **`initialMessagesDesc`・`hiddenRows`をStage 2（`otherMember`）側に前倒ししなかった。** この2クエリは`otherProfile`に依存しないため理論上はStage 2〜3と並行実行できるが、(1) 現在の設計でも既にStage 4で`myBlockOfOther`と並行実行されており、Stage 4を早めても総待ち時間（ステージ数）は変わらない、(2) `otherMember`がnullで`notFound()`になる稀なケースで無駄なクエリ発行が増える、という2点から見送った。8→4段階が「これ以上詰めても意味が薄い」ポイントと判断した
- **`GatedChatRoomLoader.tsx`側の軽微な非対称：** `messagesError`時に`hiddenRows`も無駄に取得されるようになった（`Promise.all`化により、エラー判定前に3クエリとも発行済みのため）。`myBlockOfOther`は元々messagesより先行して発行されていたため実質的な影響は`hiddenRows`のみ。エラー時のみに限られる軽微な話のため許容した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 実機での体感速度改善確認・機能退行確認（非ゲートDM切り替え、ルーム個別ロック・起動時ゲート双方でのゲート短絡確認、`otherMember`欠如時の`notFound()`確認）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 18時点）

- 上記「設計判断・学び」で検討した、Stage 2/4の境界をさらに動かす追加最適化は見送り済み（これ以上の並列化は費用対効果が薄いと判断）
- 「検討中のアイデア」節5.で挙がっていたSuspenseによるヘッダー/入力欄の据え置き案（メッセージ一覧だけ遅延ストリーミング）は今回のスコープ外のまま。`template.tsx`の強制リマウント設計との整合性検討が必要（同節参照）

### `/chat/[roomId]/hidden/page.tsx`の起動時ゲートバイパス修正（同セッション内で追加対応）

CLAUDE.md「次にやること（Phase 18・未確定）」候補6。Phase 17で`app/(shell)/chat/[roomId]/page.tsx`に対して行った修正（起動時ゲートの独立チェック追加）と同型の問題が`app/chat/[roomId]/hidden/page.tsx`にも残っていたため対応。

**問題：** `hidden/page.tsx`は永続サイドバーシェル（`app/(shell)/layout.tsx`）のRoute Group外にある独立ページのため、シェル側の起動時ゲート（`AuthGate` scopeKey="launch"）による保護を一切受けない。従来は`user_settings.auth_scope_hidden_list`（このページ専用のスコープ）のみでゲート要否を判定していたため、起動時ゲートが有効でも`auth_scope_hidden_list`がオフなら、このページを直接URLで開けば非表示メッセージ一覧が素通りできる抜け道があった。

**対応：** `settings`クエリに`auth_scope_launch`も追加し、`needsGate = hiddenListGateEnabled || launchGateEnabled`で合成判定するよう変更（`app/(shell)/chat/[roomId]/page.tsx`のroom個別ロック×起動時ゲートの合成判定と同じ考え方）。`hidden-list`専用ゲートが有効なら従来通りそちらのscopeKeyを優先し、専用ゲートがオフで起動時ゲートだけが有効な場合は`launch`スコープを再利用する（シェル側で既に解錠済みのタブでは再入力不要）。あわせて`membership`・`settings`の2クエリを`Promise.all`で並列化した（Phase 18本編と同じ観点のついで対応）。

`AuthGate.tsx`を確認し、`unlocked`がtrueになるまで`children`自体をマウントしない設計（`if (unlocked) return <>{children}</>`、それ以外はロック画面を返す）であることを確認済み。`body`（`HiddenMessagesList`）に渡すpropsは`roomId`/`currentUserId`のみで実際のメッセージ内容を含まないため、`ChatRoom`のケースとは異なりRSCペイロードへの解錠前データ混入リスクはそもそも無い（純粋に「解錠前は一覧コンポーネント自体をマウントしない」という表示制御の話）。

### 検証方法・実施内容（この追加対応分）

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 実機確認（起動時ゲートON・`auth_scope_hidden_list`OFFの状態で`/chat/[roomId]/hidden`に直接URLアクセスし、認証プロンプトが出ることの確認）はユーザー待ち

## Phase 19 の実装内容・詳細

CLAUDE.md「次にやること（Phase 18・未確定）」候補3。Phase 16で詳細設計まで完了していたグループチャットUI（FR-4）のM1（最小スコープ）を実装した。ブロッカーだったナビゲーション刷新（永続サイドバーシェル）はPhase 17で解消済み。ユーザーから「最適だと思う順番で進めてください」との指示を受け、バックログの中で最も準備が整っていた本項目を選んで着手した。

M1のスコープ：グループ作成（検索から複数選択）・グループ一覧表示（ホーム「グループ」タブ）・グループチャット内でのメッセージ送受信（送信者名表示）。メンバー追加・削除・退出・オーナー譲渡等の管理機能、既存DM専用RPC・RLS・`messages_insert_member_not_blocked`ポリシーの変更は明示的にスコープ外。

### スコープ判断（自己決定）

1. **メンバー管理UI（追加・削除・退出）はM1に含めない。** `room_members`のRLSは既にowner/self操作を許容する設計だが、UIを足すと変更範囲が広がるため次回以降の課題とした
2. **グループの最大人数に軽いソフトキャップ（合計50人＝招待49人まで）を設けた。** 要件に明記は無いが、無制限配列を許すのは工学的に不用意（誤操作・軽微なDoS的懸念）なため、`create_group_room`内でチェックする安全側のデフォルトとした
3. **`CreateGroupPanel`は`AddUserPanel`より簡素（フレンド状態バッジなし、チェックボックス+検索のみ）とした。** M1の最小構成として妥当と判断

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase19_group_room_creation_m1"）

新規RPC関数（既存パターン＝security definerでのアトミックINSERT、`revoke from public`→`grant to authenticated`→`revoke from anon`の三点セットを踏襲）：

| 関数                                            | 用途                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `create_group_room(p_member_ids uuid[], p_name text)` | グループルーム新規作成。作成者以外に2人以上（合計3人以上）を要求し、作成者を含む全メンバー間の総当たりでブロック関係が1組でもあれば拒否する |
| `get_group_conversation_list()`                 | ホーム「グループ」タブ用一覧取得。メンバー数・自分以外の全メンバー表示名配列・直近メッセージを返す |

`types/supabase.ts`をSupabase MCPの`generate_typescript_types`で再生成し、上記2関数の型を反映済み。

### 追加ファイル

- `components/home/CreateGroupPanel.tsx` — グループ作成UI。`search_users` RPCを300msデバウンスで直接呼び出し、チェックボックスで複数選択→グループ名（任意）入力→作成。`AddUserPanel.tsx`と同じ`useTransition`+try/catch+`unstable_rethrow(err)`パターンを踏襲

### 変更ファイル

- `app/actions/rooms.ts` — `createGroupRoom(memberIds, name?)`を追加（`startDirectMessageWithUser`と同じ形：認証確認→バリデーション→RPC呼び出し→エラーマッピング→成功時`redirect`）。`mapGroupError`を新設
- `components/chat/MessageBubble.tsx` — `senderName?: string`を追加。`!isOwn && senderName`の場合のみバブル内に送信者名ラベルを表示
- `components/chat/ChatRoom.tsx` — `otherUser`単数propを`peer: ChatPeer`（`{kind:"dm",...} | {kind:"group",...}`の判別共用体、このファイルからexport）に変更。ブロック機能（DM専用の概念）は`blockGateActive = peer.kind === "dm" && isBlockedByMe`という派生値に置き換え、送信ボタン・画像添付ボタン・テキストエリアのdisabled・placeholderの計4箇所で使用。ヘッダーを`peer.kind`で分岐（グループはグループ名 or メンバー名連結＋人数表示、ブロックボタン無し）。グループの場合のみ`MessageBubble`へ`senderName`を渡す
- `app/(shell)/chat/[roomId]/page.tsx` — `room.is_group`で完全に分岐。グループの場合は`room_members`→`profiles`の2段階クエリで全メンバー名を取得し（`room_members.user_id`は`profiles`への直接FKが無いためPostgRESTのネスト埋め込みが使えず、既存のDM側`otherMember`→`otherProfile`と同じ2段階パターンを踏襲）、`blocks`クエリは省略。`GatedChatRoomLoader`に`isGroup`propを追加
- `components/chat/GatedChatRoomLoader.tsx` — 新規`isGroup`propで`loadGroup()`/`loadDm()`の2関数に分岐。ロジックはpage.tsxのグループ分岐と対称
- `components/home/HomeTabs.tsx` — `ConversationItem`を`{kind:"dm",...} | {kind:"group",...}`の判別共用体に変更。型ガード`isDmConversation`/`isGroupConversation`を新設。「グループ」タブの`disabled`を解除し、固定の「準備中」表示を廃止。新規`GroupConversationRow`（グループ名 or メンバー名連結＋人数バッジ、「解除」ボタンは無し＝M1スコープ外）を追加。検索欄の代わりにグループタブでは「＋ グループを作成」ボタン→`CreateGroupPanel`の開閉を配置
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — 既存の`Promise.all`バッチに`get_group_conversation_list`を追加し、DM会話に`kind:"dm"`を付与、グループ会話を`kind:"group"`としてマッピングして結合し`HomeTabs`へ渡す（ほぼ同一の機械的変更を両ファイルに適用）

### 設計判断・学び

- **`otherMember`をゲート判定より前の`Promise.all`に含めなかった判断（Phase 18）と同じ考え方で、グループ分岐もゲート判定の後に置いた。** ゲート中ユーザーへの無駄なDB往復を増やさないという既存の重要な性質を壊さないため
- **`room_members.user_id`から`profiles`への直接FKが無いことを実装前に確認し、2段階クエリ（member_ids取得→`profiles.in()`）で対応した。** これは既存のDM側`otherMember`→`otherProfile`パターンと全く同じ制約であり、新しい問題ではない
- **ブロックチェックは「作成者⇔招待メンバー」だけでなく「招待メンバー同士」も含む総当たりにした。** `search_users`は「検索者から見たブロック」しか除外しないため、招待メンバー同士のブロックは作成時点でDB側の`create_group_room`が検出しないと、作成直後に`messages_insert_member_not_blocked`RLSでグループ全体の送信が止まってしまう（Supabase MCPで実際にこのシナリオをトランザクション内でシミュレートし、正しく拒否されることを確認済み）
- **`messages_insert_member_not_blocked`ポリシーは変更していない。** 「room内の他メンバーの誰か1人とでもブロック関係があれば送信不可」という設計のため、グループ作成後に誰か1人をブロックすると全体送信が止まる過剰に強い挙動は既知の制限としてM1では許容する（Phase 16時点から把握済み。見直すならM4以降）
- **`ChatRoom.tsx`の`isBlockedByMe`は当初の想定（Plan agentの初稿）より1箇所多い、計4箇所で使われていた（画像添付ボタンのdisabledが漏れていた）。** 実ファイルを確認してから`blockGateActive`への置き換えを行い、見落としを防いだ
- **`CreateGroupPanel`のエントリポイントは、サイドバー全体を触る新しいスロット追加ではなく、`HomeTabs.tsx`の「グループ」タブ本体内に配置した。** サイドバー内部UI再設計（「＋」新規作成メニュー等）は別のバックログ項目として残っており、M1ではその構想と競合しない最小限の統合にとどめた
- **DB層の動作確認はSupabase MCPの`execute_sql`を使い、`begin; set local role authenticated; set local request.jwt.claims ...;`で実際のユーザーとして`create_group_room`/`get_group_conversation_list`を呼び出し、正常系・異常系（メンバー不足・招待メンバー間ブロック）・RLS（非メンバーには何も見えない）を実際に確認してからロールバック/クリーンアップした。** Phase 6の「RLSの挙動をトランザクション内でシミュレートして検証する」手法をそのまま踏襲した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `get_advisors`（security・performance）を確認：新規追加した2関数は既存の全RPCと同じ`authenticated_security_definer_function_executable`の情報レベル警告のみで、新規の問題は無し
- Supabase MCPの`execute_sql`でDB層を直接検証：
  - 正常系（自分以外2人でグループ作成）→ 成功、`room_members`に owner+member×2 が正しく挿入されることを確認
  - 異常系1（自分以外1人のみ）→ `group requires at least 2 other members`で拒否
  - 異常系2（招待メンバー同士がブロック関係）→ `cannot create group: blocked member pair`で拒否（作成者⇔招待メンバーではなく招待メンバー同士のケースを明示的に検証）
  - `get_group_conversation_list()`→ 自分以外のメンバー名配列・人数が正しく返ることを確認
  - 非メンバーには`rooms`/`room_members`が一切見えないことを確認（既存RLSの継続動作確認）
  - テストデータは全てロールバックまたは明示的な削除でクリーンアップ済み
- 実機での一連のQA（グループ作成〜チャット〜一覧表示のUI操作）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 19時点）

- メンバー管理UI（追加・削除・退出・オーナー譲渡）はM1スコープ外のまま。次回M-phase候補
- `messages_insert_member_not_blocked`の「誰か1人ブロックで全体送信停止」という過剰に強い挙動は既知の制限として残置（M4以降で見直すか判断）
- サイドバー内部UI再設計（「検索⇄一覧」トグル、「＋」新規作成メニューへのグループ・一時チャット作成統合）は引き続き別のバックログ項目のまま。今回`CreateGroupPanel`はHomeTabsの「グループ」タブ内に暫定配置した
- グループの最大人数（合計50人）はエンジニアリング判断による暫定値。UI上に上限の明示は無い（送信時にサーバーエラーとして拒否されるのみ）

## Phase 20 の実装内容・詳細

CLAUDE.md「次にやること（Phase 19・未確定）」候補7（eslint 9→10・typescript 6.0→7系メジャー更新の再チェック）を実施。あわせてPhase 15スタイルの軽い技術的負債確認（TODO/FIXMEコメント・ビルドエラー抑制設定・`.env.example`の整合性）も行った。**調査の結果コード変更が必要な項目は一切無く、本Phaseはこの記録のみで完結する。**

### eslint（9→10）・typescript（6.0→7系）：状況変化なし、継続ブロック（2026-08-13時点）

- `typescript-eslint`（現行8.65.0）の`peerDependencies.typescript`は依然`>=4.8.4 <6.1.0`のまま。前提となる**TypeScript 7.1自体も未リリース**（`npm view typescript dist-tags`：`latest: 7.0.2`、`next: 7.1.0-dev.20260813.1`のdevビルドのみ）
- `eslint-plugin-react`は依然7.37.5のまま、`peerDependencies.eslint`は`^9.7`まで（`eslint-config-next@16.3.0`が同梱するバージョンも変わらず）
- Phase 16で言及したESLint 10対応PR（[jsx-eslint/eslint-plugin-react#4022](https://github.com/jsx-eslint/eslint-plugin-react/pull/4022)）の状況をWeb検索で確認：**依然オープンのまま。** レビュアー承認済み・独立検証（ESLint 9.39.4と10.8.1で1,229件の指摘が一致）も完了しているが、メンテナ（ljharb）の最終アクション待ちの状態がPhase 16時点から変わっていない
- `npm audit`：脆弱性0件
- `npm outdated`：`@types/node`（22.20.1→26.2.0）・`eslint`（9.39.5→10.8.1）・`typescript`（6.0.3→7.0.2）の3件のみ。`@types/node`はNode.jsランタイムのターゲットとは無関係な最新配布のため意図的に追従しない（Phase 11の判断を継続）

### 技術的負債の簡易確認：問題なし

- `app/`/`components`/`lib`配下にTODO/FIXME/XXX/HACKコメント：0件
- `next.config.ts`にビルドエラー抑制設定（`eslint.ignoreDuringBuilds`・`typescript.ignoreBuildErrors`）：無し
- `.env.example`：CLAUDE.md記載の環境変数一覧と一致

### 検証方法・実施内容

- コード変更が無いため`npx tsc --noEmit`・`npx eslint .`・クリーンビルドは今回実施していない（無風のため）
- `npm view`・`npm outdated`・`npm audit`・grepによる調査のみ

### 未対応・持ち越し事項（Phase 20時点）

- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中。**次回監視ポイント：** `eslint-plugin-react`の新バージョン公開有無（PR #4022マージ後を想定）、TypeScript 7.1の正式リリース＋`typescript-eslint`の対応リリース

## Phase 21 の実装内容・詳細

Phase 19（グループチャットUI M1）で持ち越していた「未対応・持ち越し事項」の筆頭項目、メンバー管理UI（追加・削除・退出）のM2に着手。ユーザーから「続きお願いします、次にやることを計画してください」との指示を受け、サイドバー再設計・小粒課題群（いずれもユーザーの主観的な好みの確認が必要）よりも自律的に進めやすい本項目を選んだ。

M2のスコープ：メンバー一覧表示（オーナーバッジ付き）・オーナーによるメンバー追加（検索から複数選択）・オーナーによる非オーナーメンバーの削除・非オーナーメンバーの自主退出。**オーナーの退出・オーナー譲渡・グループ削除はM2のスコープ外**（ボタン自体を出さない）。

### 設計上の重要な判断：新しいルートを作らない

メンバー管理UIは`/chat/[roomId]/members`のような独立ページにせず、既にAuthGate通過後にのみレンダリングされる`ChatRoom.tsx`内のモーダルとして実装した。新ルートを作ると、Phase 18で修正したばかりの「起動時ゲートの独立チェックが漏れる」というバグ種別（`/chat/[roomId]/hidden`の直接URLバイパス）を自ら再導入することになるため。

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase21_group_member_management_m2"）

新規RPC`add_group_members(p_room_id uuid, p_member_ids uuid[])`のみ追加した。**メンバー削除・退出には新規RPCを追加していない。** `room_members_delete_self_or_owner`のRLS（`user_id = auth.uid() or is_room_owner(room_id)`）が既に自己削除・オーナーによる削除の両方を許可しており、単一行DELETEにアトミック性の要件が無いため、`app/actions/rooms.ts`内のServer Actionで素のテーブル操作を行う（`create_group_room`が最初のowner行挿入のためにRPCを必要としたのとは異なり、既存の行を消すだけなのでchicken-and-egg問題が発生しない）。

`add_group_members`は既存の`create_group_room`と同じsecurity definerパターンを踏襲し、以下を検証する：オーナーのみ実行可・対象ルームがグループであること・重複除去/自己除外/既存メンバー除外（既にメンバーのIDはサイレントにスキップ）・合計人数が50人を超えないこと・対象プロフィールが実在すること・**新規メンバー同士および新規⇔既存の総当たりでブロック関係が無いこと**（既存メンバー同士は作成時/過去の追加時に検証済みのため対象外とし、チェック範囲を絞ることで計算量を抑えた）。

### 変更ファイル

- `app/actions/rooms.ts` — `addGroupMembers`・`removeGroupMember`・`leaveGroup`を追加。エラーマッピングは既存の`mapGroupError`を使い回さず`mapAddMembersError`を独立させた（`mapGroupError`の「ブロック」「汎用フォールバック」文言が「作成できません」という`createGroupRoom`専用の言い回しになっており、メンバー追加の文脈で使うと不自然になるため）。`removeGroupMember`/`leaveGroup`は自分の`role`を事前取得してからの多層防御チェック＋素のテーブルDELETE（RLSが実際のセキュリティ境界）
- `components/chat/ChatRoom.tsx` — `ChatPeer`のgroup変種を`memberCount`削除＋`members`に自分を含む全メンバー（role付き）を持たせる形に変更。新規`groupMembers`ローカルstate（`peer.members`から1回だけ初期化）を単一の参照元にし、ヘッダー表示・`memberNameById`・`isGroupOwner`の導出をすべてこれ経由に統一（追加・削除後に即座に反映されるようにするため）。名前結合表示のみ自分を除外してM1時点の見た目を維持
- `app/(shell)/chat/[roomId]/page.tsx` / `components/chat/GatedChatRoomLoader.tsx` — グループ分岐で`role`も取得し、自己除外フィルタを削除（`ChatPeer`の新形状に合わせる機械的変更）
- `components/chat/ChatRoomOptionsMenu.tsx` — 新規`peer`/`onOpenMembers` props。グループの場合のみ「メンバー一覧」エントリを表示（新ルートを作らないため`<Link>`ではなく既存の「鍵をかける」等と同じ`onClick`ボタンスタイル）

### 追加ファイル

- `components/chat/GroupMembersPanel.tsx` — `ChatRoom.tsx`からモーダルとして開く。メンバー一覧（オーナーバッジ）・メンバー追加セクション（オーナーのみ、`CreateGroupPanel.tsx`と同じ`search_users`検索パターンを流用するがグループ名入力・選択数下限は無し）・退出ボタン（非オーナーのみ）

### 設計判断・学び

- **`router.refresh()`ではなくローカルoptimistic state更新を採用した。** 非ゲート時の`page.tsx`経路では`peer` propが素のままJSXで参照されているため`router.refresh()`で新しいサーバーpropsが流れてくるが、ゲート時の`GatedChatRoomLoader.tsx`経路では`peer`が`useEffect`内で1回だけ取得される独立したクライアントstateのため`router.refresh()`が一切効かない（サーバー側の再取得の仕組みと無関係なため）。この非対称性はまさにPhase 18で修正したバグ種別と同じ「ゲート時・非ゲート時で挙動が変わる」パターンであり、両経路で確実に一致させるためローカルstateパッチ方式に統一した
- **`ChatRoom.tsx`の既存`handleToggleBlock`の`router.refresh()`は主要な状態更新手段ではないことを確認した上で設計した。** `isBlockedByMe`は既に`setIsBlockedByMe(next)`で即座に更新されており、`router.refresh()`は他のサーバー描画箇所（次回ナビゲーション時の`initialIsBlockedByMe`等）向けの副次的な再検証に過ぎない。この既存パターン（「まずローカルsetStateで楽観的更新、`router.refresh()`は保険」）をM2でも踏襲した
- **DB層の検証はSupabase MCPの`execute_sql`でトランザクション内シミュレーション（Phase 19と同じ手法）を行い、正常系・異常系3パターン（非オーナー呼び出し拒否・全員既にメンバーで拒否・新規⇔既存のブロック関係で拒否）・削除（オーナーによる削除成功／非オーナーによる他人削除がRLSで0件拒否）・退出（自己削除成功＋退出後のルーム不可視性）まで実データで確認済み**

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `get_advisors`（security・performance）：新規`add_group_members`は既存の全RPCと同じ想定内の情報レベル警告のみ、新規の問題は無し
- Supabase MCPの`execute_sql`でDB層を直接検証（上記「設計判断・学び」参照）。テストデータは全てロールバックまたは明示的な削除でクリーンアップ済み
- 実機での一連のQA（メンバー一覧表示・追加・削除・退出のUI操作、起動時ゲート/各チャットロック有効時の`GatedChatRoomLoader`経路含む）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 21時点）

- オーナーの退出・オーナー譲渡・グループ削除は引き続き未実装（M2でも明示的にスコープ外のまま）→ **Phase 22で対応**
- `messages_insert_member_not_blocked`の「誰か1人ブロックで全体送信停止」という過剰に強い挙動は引き続き既知の制限として残置
- サイドバー内部UI再設計・小粒課題群は引き続き別のバックログ項目のまま（ユーザーの好みの確認待ち）

## Phase 22 の実装内容・詳細

Phase 21（グループチャットメンバー管理M2）で明示的にスコープ外とした「オーナーの退出・オーナー譲渡・グループ削除」（M3）に着手。ユーザーから「次に何をやるべきか、自律的に計画してください」との指示を受けた。残バックログのうちサイドバー内部UI再設計・小粒課題群はユーザーの主観的な好みの確認が必要、自動テスト基盤導入は影響範囲の大きいツール選定判断のため次回相談すべき事項と判断し、機能追加として自然な続きである本項目（M1→M2→M3の流れ）を選んだ。

M3のスコープ：オーナーが別の既存メンバーへオーナー権を譲渡する機能、グループ削除機能。「オーナーの退出」は独立機能としては作らず、**譲渡してから既存の`leaveGroup`で退出する二段階フロー**として実現した（ゼロオーナー状態・自動オーナー継承は許容しない設計判断）。

### 設計上の重要な技術的知見

`room_members_update_owner`のRLS（`using (is_room_owner(room_id)) with check (is_room_owner(room_id))`）は、`is_room_owner`が「呼び出し者自身の行がowner役割か」をチェックするため、オーナーが自分自身の行を`owner`→`member`に更新しようとすると、`WITH CHECK`の再評価時点で既に呼び出し者はownerでなくなっており自己参照的に失敗する（`create_group_room`が最初のowner行挿入のためにRPCを要した「chicken-and-egg」問題と構造的に同じ）。そのため素のテーブルUPDATEでは実現不可能で、新規`transfer_group_ownership` RPC（security definer、RLSを完全にバイパスして2行のUPDATEをアトミックに行う）が必要だった。

一方グループ削除は既存の`rooms_delete_owner`RLS（`using (is_room_owner(id))`）が単一行DELETEを既に許可しており、`rooms`→`room_members`/`messages`のカスケード削除（`on delete cascade`）も効くため、**新規RPCは不要**（Server Action内の素のテーブル操作で十分。Phase 21のメンバー削除・退出と同じ理由）。

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase22_group_ownership_transfer_deletion_m3"）

新規RPC`transfer_group_ownership(p_room_id uuid, p_new_owner_id uuid)`のみ追加。既存パターン（security definer、`revoke from public`→`grant to authenticated`→`revoke from anon`の三点セット）を踏襲。

### 変更ファイル

- `app/actions/rooms.ts` — `transferGroupOwnership`・`deleteGroup`を追加。エラーマッピングは`mapAddMembersError`を使い回さず`mapTransferOwnershipError`を独立させた（`mapGroupError`/`mapAddMembersError`分離と同じ判断。既存文言が「追加」に紐づいており譲渡の文脈で不自然になるため）。`leaveGroup`のオーナー時エラーメッセージに「先にオーナーを譲渡してください。」を追記し、JSDocも二段階フローの説明に更新（M3で退出への導線が実在するようになったため、案内しないままだと実質的なUX後退になる）
- `components/chat/GroupMembersPanel.tsx` — 各メンバー行に「オーナーを譲渡」ボタンを追加（既存の「削除」ボタンと同じ表示条件、`flex flex-wrap justify-end gap-1`で狭い幅でも折り返せるように）。「グループを削除」ボタンをオーナー専用セクション末尾に追加（既存の退出ボタンと同じ危険操作スタイル）

**`components/chat/ChatRoom.tsx`・`components/chat/ChatRoomOptionsMenu.tsx`は無改修。** `isGroupOwner`は`groupMembers`（`ChatRoom.tsx`のローカルstate）から毎レンダー導出されるため、`onMembersChange`経由で`groupMembers`をパッチするだけでヘッダー・ボタン表示が自動的に正しく反映される（Phase 21で確立した設計の効果）。削除後の遷移も`GroupMembersPanel.tsx`が既に持つ`useRouter()`だけで完結する。

### 設計判断・学び

- **オーナー譲渡は`.map()`、追加/削除は`.filter()`/append。** 譲渡は行の追加・削除ではなく既存2行の`role`書き換えであるため、`GroupMembersPanel.tsx`の`onMembersChange`パッチロジックも`members.map(m => ...)`で自分を`member`に、対象を`owner`に書き換える形にした（既存の追加/削除ハンドラとは異なるデータ操作の性質）
- **DB層の検証で「旧オーナーが権限を失い、新オーナーが権限を持つ」ことを実際にRPC呼び出しで確認した。** `transfer_group_ownership`を実際にコミットした上で、別トランザクションで旧オーナー（test1）が`add_group_members`を呼べなくなること・新オーナー（test2）が呼べるようになることをSupabase MCPの`execute_sql`で直接検証した（型・ロジックの正しさだけでなく、RLS側の実際の権限移行も確認）
- **M3はM1/M2よりファイルtouch数が少なく完結した。** `ChatRoom.tsx`/`ChatRoomOptionsMenu.tsx`の無改修という設計上の帰結により、`app/actions/rooms.ts`と`GroupMembersPanel.tsx`の2ファイル＋1マイグレーションで完結した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `get_advisors`（security・performance）：新規`transfer_group_ownership`は既存の全RPCと同じ想定内の情報レベル警告のみ、新規の問題は無し
- Supabase MCPの`execute_sql`でDB層を直接検証：正常系（オーナー譲渡が成功しrole入れ替わりを確認）・異常系3パターン（非オーナー呼び出し・対象非メンバー・自己譲渡）・権限移行の実地確認（旧オーナー拒否・新オーナー許可）・グループ削除（オーナーによる削除成功＋カスケード削除・非オーナーによる削除がRLSで拒否）
- 実機での一連のQA（オーナー譲渡のUI即時反映、譲渡後の退出、グループ削除、非オーナーには両操作が一切見えないこと）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 22時点）

- グループ名の変更・アバター設定等、グループのプロフィール編集機能は引き続き未実装（M1〜M3のいずれのスコープにも含まれていない）
- サイドバー内部UI再設計・小粒課題群は引き続き別のバックログ項目のまま（ユーザーの好みの確認待ち）→ **サイドバー内部UI再設計はPhase 23で対応**

## Phase 23 の実装内容・詳細

CLAUDE.md「次にやること」候補4（サイドバー内部UIの再設計）に着手。Phase 16でユーザーから出ていた当初構想（「ユーザー検索」「チャット一覧（統合＋種別絞り込み）」の2画面切替＋「＋」新規作成メニュー、種別切替はタブ型で）に沿って、Phase 17で骨組みのみ実装していたサイドバー内部（`AddUserPanel.tsx`・`HomeTabs.tsx`・`CreateGroupPanel.tsx`）を再設計した。実装前にExplore→AskUserQuestion→Planエージェントの計画フローを経て、ユーザーに4つの分岐点（切替UIの見た目・PC幅の挙動・一覧の統合要否・＋メニューの範囲）を確認してから着手した。

### ユーザーが確定した設計方針

1. サイドバー最上部に「検索」「一覧」の2タブを配置し、クリックで排他的に表示を切り替える
2. PCも含め常に排他表示（Phase 13の「AddUserPanel PC常時展開」は撤回）
3. フレンド/ストレンジャー/グループを直近メッセージ順に統合した「すべて」ビューを基本とし、フレンド/ストレンジャー/グループの絞り込みタブも維持する
4. グループ作成・一時チャット作成の両方を「＋」アイコンのメニューに集約する。通常のDM開始・フレンド申請は引き続き「検索」タブから行う

### 追加ファイル

- `components/ui/Modal.tsx` — 汎用モーダルラッパー（背景クリック・Escapeキーで`onClose`、`role="dialog"` `aria-modal`）。既存の`GroupMembersPanel.tsx`が持つ`fixed inset-0 z-20 flex items-center justify-center bg-ink/40 backdrop-blur-sm`パターンを踏襲。中身のパディング・タイトルは持たせず子コンポーネント側の裁量に残す設計。**新規2箇所（`CreateGroupPanel.tsx`・`CreateTempChatPanel.tsx`）にのみ適用し、既存の`GroupMembersPanel.tsx`自体は追従させていない**（無関係な既存ファイルへの染み出しを避けるため、今回のスコープ外とした）
- `components/home/CreateTempChatPanel.tsx` — サイドバー「＋」メニューから開く一時チャット作成モーダル。旧`AddUserPanel.tsx`の検索結果行に埋め込まれていた有効期限セレクター（`DURATION_OPTIONS`等）をここに移設し、`CreateGroupPanel.tsx`と同じ`search_users`デバウンス検索パターンに載せ替えた。グループ作成と異なり単一選択（`Map`ではなく`selected: SearchResult | null`）。既にDMルームがある相手は`create_temp_dm_room`が既存ルーム検索をしない仕様のため選択不可にする（旧`AddUserPanel.tsx`の`!r.existingRoomId`ガードを踏襲）

### 変更ファイル

- `components/home/SidebarNav.tsx`（新規） — サイドバー全体の合成コンポーネント。「検索」「一覧」タブバー＋未読フレンド申請バッジ＋「＋」ドロップダウン（`ChatRoomOptionsMenu.tsx`と同じ`wrapperRef`+`mousedown`外側クリック検知パターン）＋選択中ビュー（`AddUserPanel`または`HomeTabs`）を1つにまとめる。`app/(shell)/layout.tsx`と`components/shell/GatedShellBody.tsx`の2箇所で重複していた`<AddUserPanel/><HomeTabs/>`組み立てJSXをここに集約した副産物もある
- `components/home/AddUserPanel.tsx` — 開閉chrome（`open` state・モバイル固定ボトムバー・PC常時展開用の固定幅スタイル・トグルボタン）を全削除し、親（`SidebarNav`）から表示/非表示を制御される単純な内容物に縮小。有効期限セレクター関連を`CreateTempChatPanel.tsx`へ移設したため、「メッセージ」ボタンは常に`startDirectMessageWithUser`のみを呼ぶ単純な形になった。未読バッジの表示・既読化トリガーも`SidebarNav.tsx`へ移管
- `components/home/HomeTabs.tsx` — `TabKey`に`"all"`を追加してデフォルト化。「すべて」選択時はDM・グループを`lastMessageAt`降順（nullは最下部）で統合ソートして表示する。「＋グループを作成」ボタン＋`CreateGroupPanel`のインライン展開ブロックを削除（サイドバー「＋」メニューに移管したため`CreateGroupPanel`への依存自体が無くなった）。FR-14検索欄を全タブで常時表示にし、フィルタ述語もグループ（`groupName`/`memberNames`）を対象に含めるよう拡張した
- `components/home/CreateGroupPanel.tsx` — ルート要素を新設`Modal`でラップし、`GroupMembersPanel.tsx`と統一した見た目のタイトル行＋「×」ボタンを追加。呼び出され方が「`HomeTabs.tsx`のグループタブ内にインライン展開」から「サイドバー『＋』メニューから開くモーダル」に変わった
- `components/shell/ShellRow.tsx` — サイドバーラッパーの幅を`md:w-[32rem]`→`md:w-80`（暫定値、実機確認後に再調整前提）に縮小し、`md:flex-row`を削除。以前はAddUserPanel+HomeTabsの2カラム横並び用の指定だったが、今回からサイドバーは`SidebarNav`単体（内部で検索/一覧を排他表示）になったため不要になった
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — `<AddUserPanel/><HomeTabs/>`のフラグメントを`<SidebarNav .../>`呼び出し1つに置換。データ取得（`Promise.all`）自体は無変更

### 設計判断・学び

- **「＋」メニューから開くモーダルの自動クローズが必須の対策だった。** `createGroupRoom`/`startTemporaryDirectMessage`は成功時にServer Action内で`redirect()`する既存の設計（変更不可）だが、これらを呼ぶ`CreateGroupPanel`/`CreateTempChatPanel`は永続サイドバーシェルの一部（`SidebarNav`、`app/(shell)/layout.tsx`配下）にマウントされる。Phase 17の設計通りこの階層はナビゲーションで再マウントされないため、何もしないと「グループ作成→新しいチャット画面に遷移したのにモーダルが画面に残る」という不具合になるところだった（`GroupMembersPanel.tsx`が同じ問題を起こさないのは、`template.tsx`によりroomId変更ごとに強制リマウントされる非永続領域＝`{children}`側にあるため）。対策として`SidebarNav.tsx`で`usePathname()`（URL由来でハイドレーション不一致の心配がない、`ShellRow.tsx`の`useSelectedLayoutSegment()`と同種の方針）を監視し、変化したら`activeModal`のみをリセットするようにした（「検索」/「一覧」タブの選択状態はナビゲーションをまたいで保持してよいためリセット対象に含めない）
- **未読フレンド申請バッジの自動既読化トリガーを`open`（旧AddUserPanel.tsx自身の開閉状態）から`activeView === "search"`（SidebarNav側）に移したことで、Phase 13の既知の制約「PCでは未読バッジが自動で消えない」が副産物的に解消された。** 旧実装はPCで`open`が常にfalseのまま変化しなかったため既読化effectが発火せず、ヘッダーのトグルボタンをこの副作用を手動発火させるためだけに残す非対称設計になっていた。今回はPC・モバイル問わず「検索」タブに切り替えた瞬間に一貫して発火する
- **モーダルの共通化はrule of threeを満たすが、既存の`GroupMembersPanel.tsx`自体への追従は見送った。** 新設2箇所（`CreateGroupPanel`・`CreateTempChatPanel`）だけを対象にすることで、今回のタスク（サイドバー再設計）と無関係な既存ファイルへの差分・回帰リスクを広げないようにした（`GroupMembersPanel.tsx`のModal化は任意の低優先度クリーンアップとして残す）
- **FR-14検索欄をグループタブでも表示する変更に伴い、フィルタ述語の拡張が必須だった。** 表示条件だけを緩めてフィルタ述語（DM専用の判定のみ）を直さないと、グループタブで検索欄が見えるのに何も効かない壊れたUIになるため、`groupName`/`memberNames`の部分一致もあわせて追加した
- **サイドバー幅`md:w-[32rem]`（旧：AddUserPanel固定18rem＋HomeTabs残り約14remの2カラム横並び用）を`md:w-80`（20rem/320px）に縮小した。** 単一ビュー表示になったため2カラム前提の幅は過大と判断したが、Phase 17の記録と同様この値も実機確認後の再調整を前提とした暫定値として扱う
- **Planエージェントによる設計提案を、実ファイル（`AddUserPanel.tsx`・`CreateGroupPanel.tsx`・`ShellRow.tsx`・`app/(shell)/layout.tsx`・`GatedShellBody.tsx`）の直接確認で検証してから実装に入った。** 行番号・クラス名の記述はすべて実コードと一致しており、特に上記「＋メニューモーダルの自動クローズ」の論点は実装前の設計段階で発見できたため、手戻りなく実装できた

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（`SidebarNav.tsx`の`usePathname()`監視effectで`react-hooks/set-state-in-effect`が1件検出されたため、既存踏襲パターン通り`eslint-disable-next-line`を追加して解消。最終的にエラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- DB層の変更は無し（既存の`search_users`／`startDirectMessageWithUser`／`startTemporaryDirectMessage`／`createGroupRoom`／`markFriendRequestsRead`等をシグネチャ・戻り値とも変えずに呼び出し元だけ再配線したため、`execute_sql`等でのDB検証・`types/supabase.ts`再生成は不要と判断し実施していない）
- 実機での一連のQA（検索/一覧タブの排他切替、統合「すべて」ビューのソート、＋メニューからのグループ/一時チャット作成とモーダル自動クローズ、起動時ゲート有効時の`GatedShellBody`経路含む）はユーザーによる実機確認待ち

### デザイン修正（同セッション内で追加対応）

実機を見たユーザーから「全体的に要素サイズが大きい（情報量が増えたときに窮屈・長い文字列がはみ出す・一度に表示できる会話数が少ない・今後の機能追加に耐えない）」「検索/一覧タブが左に寄りすぎ、もっと広く大きく使ってほしい」「一覧のサブフィルタ（すべて/フレンド/ストレンジャー/グループ）はスペースを取らないセレクトメニュー形式に」「未フレンド等の状態チップは不要、削除」という4点の指摘があり対応した。ユーザーからは「その他に改善できると判断した場合、改善内容を提示することを条件に修正して構わない」との裁量も与えられたため、密度に関わる周辺箇所もあわせて調整した。

**明示的な指摘への対応：**

- `components/home/SidebarNav.tsx` — 「検索」「一覧」タブを、小さいテキストボタンが左寄りに並ぶ形から、行の大部分（`flex-1`ずつ）を占めるセグメントコントロール（`rounded-lg bg-surface p-1`の枠内に、アクティブ側が`bg-tongue text-white`のピル状にハイライトされる2ボタン）に変更。フォントも`text-xs`→`text-sm`、パディングも`px-4 py-3`→`px-4 py-2.5`（横幅拡大に伴い縦は微調整）に。「＋」ボタンも`h-8 w-8`→`h-10 w-10`に拡大し、大きくなった切替コントロールとの視覚的バランスを取った
- `components/home/HomeTabs.tsx` — サブフィルタの4ボタン（`TabButton`、件数バッジ付き）を廃止し`<select>`1つに置き換え。検索欄と同じ行に横並び配置することで、専用の行を消費しないようにした（`TabButton`関数自体も未使用になったため削除）。件数表示は「スペースを取らない」という要求に合わせて割愛した（選び直せば件数は一覧の長さで分かるため実害は小さいと判断）
- `ConversationRow`（`HomeTabs.tsx`） — フレンド状態チップ（`FRIENDSHIP_BADGE`による「未フレンド」「申請中」「申請あり」等の表示）を完全に削除。定数`FRIENDSHIP_BADGE`自体も未使用になったため削除した。一時チャットの残り時間バッジ（`isTemporary`）は情報の性質が異なる（期限切れが近いという時間的に重要な警告であり、装飾的な状態表示ではない）ため区別して残した

**密度改善のため追加で調整した箇所（ユーザーへの提示事項）：**

- `AddUserPanel.tsx` — 外枠パディング`px-6 py-4`→`px-4 py-3`、要素間`gap-4`→`gap-3`。検索結果・フレンド申請・ブロック中一覧の各行を`py-2`→`py-1.5`、リスト間隔`gap-2`→`gap-1.5`に統一して圧縮
- `ConversationRow`/`GroupConversationRow`（`HomeTabs.tsx`） — 行パディング`px-6 py-4`→`px-4 py-2.5`、アバター`h-10 w-10`→`h-8 w-8`、直近メッセージプレビューの文字サイズを`text-sm`→`text-xs`に縮小（「一度に表示できる会話数が少なすぎる」への対応として、1行あたりの高さを詰めた）
- `CreateGroupPanel.tsx`/`CreateTempChatPanel.tsx`（モーダル） — 内側パディング`p-4`→`p-3`、要素間`gap-3`→`gap-2.5`

**設計判断：** 「検索/一覧」タブだけは他の要素と逆方向（拡大）の調整を行った。これはユーザーの指摘が「全ての要素が一律に大きい」ではなく「繰り返し表示される要素（一覧の行・チップ・サブフィルタボタン）は密度を優先すべきだが、画面の最上位にあるナビゲーション自体は存在感を持たせて広く使うべき」という区別だったと解釈したため。この解釈が違う場合はフィードバックをお願いしたい。

**検証：** `npx tsc --noEmit`・`npx eslint .`・`rm -rf .next && npm run build`いずれもエラー0件を確認。DB層の変更は無し。実機での見た目確認はユーザー待ち。

### 未対応・持ち越し事項（Phase 23時点）

- `docs/srs.md` 3.2.1節に残る「独立した検索タブとしては実装せず」という注記（Phase 5→Phase 15で確定した記述）が、今回の変更で実態と乖離した（今回まさに独立した「検索」タブを新設したため）。別セッションでの整合作業を推奨（Phase 15と同種の対応）
- `GroupMembersPanel.tsx`を新設`components/ui/Modal.tsx`へ追従させる作業（任意の低優先度クリーンアップ）
- サイドバー幅`md:w-80`は暫定値、実機確認後の再調整余地あり
- モバイルでチャット画面から一覧へ戻るUIが無い問題（Phase 16由来、既存バックログ）は今回もスコープ外のまま

## 検討中のアイデア・未確定のPhase割り当て

以下はPhase 4完了後の会話で出た検討事項で、Phase 5完了時点でも状況は大きく変わっていない。SRS本文にはまだ反映していない、あるいはどのPhaseにも割り当てが確定していないものなので、次にPhase構成を見直すタイミングで扱いを決めること。

### 1. どのPhaseにも未割り当てのSRS要件

- **グループチャットUI（FR-4）：** **Phase 19でM1（グループ作成・一覧表示・メッセージ送受信＋送信者名表示）、Phase 21でM2（メンバー一覧・追加・削除・退出）、Phase 22でM3（オーナー譲渡・グループ削除）を実装済み。** 詳細は「Phase 19」「Phase 21」「Phase 22 の実装内容・詳細」参照。グループ名変更・アバター設定等のプロフィール編集機能は未実装（次のM-phase候補）。`messages_insert_member_not_blocked`ポリシーは「room内の他メンバーの誰か1人とでもブロック関係があれば送信不可」という設計のまま変更しておらず、グループでは「メンバーの誰か1人をブロックしただけで全体送信が止まる」という過剰に強い挙動が既知の制限として残っている（見直すなら次のM-phase以降）
- **テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）：** Phase 14で実装済み
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

### 3. ナビゲーション構造の刷新（永続サイドバーシェル・Phase 16で判明）

Phase 16で、グループチャットUI M1の設置場所をユーザーに確認した際に判明した構想（2026-08-12）。**上記「2. 複数チャットレイアウト対応」（メッセージ吹き出しの見た目＝LINE風/Discord風の話）とは別物なので混同しないこと。** 今回のテーマはメッセージの見た目ではなく、ホーム画面／チャット画面の**ナビゲーション構造**そのもの。

**ユーザー提案の内容：**

- ホーム画面の左サイドバーに、「ユーザー検索」「チャット一覧（フレンド/ストレンジャー/グループを直近メッセージ順に統合表示。種別ごとの絞り込み表示も可能）」の2画面を切り替えられるようにしたい
- サイドバー上部に「＋」（新規作成）アイコンを置き、押すとグループ作成・一時チャット作成のオプションを選べる画面（モーダルまたはサイドバー内）を表示したい
- チャット一覧から会話を選んだときの遷移方法として、以下2案のどちらかにしたい：
  1. 画面全体（サイドバー含む）は保持したまま、メインコンテンツ部分だけをチャット画面に切り替える
  2. `/chat`へページ遷移するが、`/home`と全く同じサイドバーをそのまま左に表示し続ける（チャットを開いてもサイドバーの状態が完全に保持されるのが望ましいが、実現が難しい可能性があることは本人も認識している）

**Claudeによるfeasibility評価（Phase 16時点。実物ドキュメントでの裏取りはまだ）：**

- 技術的には十分実装可能。Next.js App Routerの「共有レイアウト」機構（`layout.tsx`をルートグループでラップする）はまさにこの用途のための標準機能で、共有レイアウト配下のページ間をクライアント側遷移する際、レイアウト自体は再マウントされない（サイドバーの開閉状態・スクロール位置等が保持される）という挙動が期待できる。上記案の2（`/chat`遷移＋サイドバー保持）はこの機構で実現するのが最も素直
- ただし**小さな変更ではない**。具体的に必要になる作業：
  - 現在`/home`・`/chat/[roomId]`は共有レイアウトを持たない独立ページ。サイドバー部分（会話一覧・ユーザー検索＝現行の`HomeTabs`/`AddUserPanel`相当）を`app/(shell)/layout.tsx`のような共有レイアウトへ切り出す
  - 起動時認証ゲート（`AuthGate` scopeKey="launch"）は現在ページ単位（`/home`・`/chat/[roomId]`の2箇所に個別実装。Phase 6の持ち越し事項参照）。シェル全体に1回だけゲートをかけるのか、個々のページに残すのかを再設計する必要がある
  - `app/home/page.tsx`と`components/home/HomeContent.tsx`（非ゲート/ゲートの2系統）に重複している会話一覧取得ロジックの置き場所も整理が必要
  - 案の1（ページ遷移せずメインコンテンツだけ切り替え）は共有レイアウトなしでも実現できるが、`/chat/[roomId]`のブックマーク性・共有可能性を失う、DM/グループ作成後の`redirect(/chat/${roomId})`という既存パターンと相性が悪い、ブラウザの戻る/進むを独自に扱う必要が出る、といったトレードオフがある
- **グループチャットUIの一覧・作成UI（上記1.のM1設計）は、この刷新の方向性に直接依存する。** 「サイドバーの＋からグループ・一時チャットを作成」「チャット一覧をフレンド/ストレンジャー/グループ横断で見る」という提案は、Phase 16で設計したM1の「`/home`の『グループ』タブ内に閉じた作成UI」という置き場所そのものと競合する。**そのため、着手順序はこちらの方向性決定を先にすることを推奨する。**

**次回セッションでの進め方（案）：** まず本セクションの方向性（案1/案2、実装するかどうか）をユーザーと確定し、Explore/Planエージェントでルートグループ化の詳細設計を行ってから、グループチャットUIのM1着手を再検討する。

**実装状況（Phase 17で更新）：** 上記の方向性確認・実物ドキュメントでの裏取り・詳細設計・実装（M1・骨組み）まで完了した。採用したのは案2寄りの構成（Route Groups + 共有Layout。`<Link>`遷移でレイアウトが再マウントされないことを利用し、URLも`/chat/[roomId]`のまま変わる、案1・案2の両方が同時に満たされる形）。詳細は「Phase 17 の実装内容・詳細」参照。**サイドバー内部UI（「検索⇄一覧」トグル、「＋」新規作成メニュー）の再設計はPhase 23で実装済み。** 詳細は「Phase 23 の実装内容・詳細」参照。実機での最終確認待ち。

### 4. 実機フィードバックで見つかった追加の要望・小粒課題（Phase 16時点）

Phase 16で、上記3.のヒアリング中に合わせて出てきた小粒な要望・課題。優先度・Phase割り当てはいずれも未確定。

- チャット画面からホームへ戻るUIが無い（現在`ChatRoom.tsx`のヘッダーには相手アイコン・ブロックボタン・オプションメニューはあるが、戻る導線がない）
- 一時チャットに名前を付けたい。`rooms.name`列は既に存在するが一時チャットでは未使用（`create_temp_dm_room`は`name`引数を持たない）なため、拡張自体は小さい見込み。なお同じ相手との一時チャットを複数同時に持つこと自体は、`create_temp_dm_room`が（`get_or_create_dm_room`と異なり）既存ルームの検索をしない実装のため**現状でも技術的には可能**（一覧・作成UI側がその状態を想定していないだけ）
- チャット画面から（ユーザー追加パネルを経由せず）その場でスムーズに一時チャットを作成できるようにしたい
- スクロールバーの見た目を自前で整えたい（特にチャット画面で目立つとの指摘）
- ユーザーごとのプロフィール・アイコンの概念が欲しい（`profiles.avatar_url`列自体は既存だが、設定・編集UIが無い）
- 既読機能が欲しい。ただし「将来のグループチャットでは作成者/管理者が既読機能の有無を設定できるように」という条件付きの要望のため、グループチャットのロール設計とセットで検討する
- 種別を切り替えるUIは基本的にタブ型を使ってほしい（状況に応じて使い分け可）という全体的なデザイン方針の要望

### 5. チャット切り替え時の体感速度改善（Phase 17時点・実機フィードバック）

Phase 17実装後の実機確認で、チャット切り替え時に約0.7秒の読み込み待ちが発生することが判明した（`npm run dev`での計測。`npm run build && npm run start`の本番相当ビルドでは改善したが、さらに高速化したいとの要望）。

**判明した原因：** `app/(shell)/chat/[roomId]/page.tsx`が、最大8回のDB問い合わせ（`getUser`・`rooms`・自分の`room_members`・`user_settings`・相手の`room_members`・`profiles`・`blocks`・`messages`・`message_hidden`）を`Promise.all`で並列化せず直列に`await`している。`app/(shell)/layout.tsx`（サイドバー側）は最初から`Promise.all`で並列取得しているため、この非対称性が原因と見られる。**→ Phase 18でクエリの並列化（4段階への圧縮）まで対応済み。** 詳細は「Phase 18 の実装内容・詳細」参照。実機での体感速度改善確認は引き続きユーザー待ち

**ユーザーからの追加提案：** チャット切り替え時、ヘッダー（相手アイコン・名前・ブロックボタン・オプションメニュー）とメッセージ入力欄は実際にはほとんど変化しない部品のはずなのに、読み込み中は他の要素と一緒に消えてしまっている。React/Next.jsのSuspere（ストリーミング）を使い、軽いクエリで済むヘッダー用データ（相手のプロフィール）を先に描画し、重いメッセージ一覧だけ遅れて表示する分離ができるのではないか、という提案があった。

**この提案とPhase 17で追加した`template.tsx`との関係（要検討）：** `app/(shell)/chat/[roomId]/template.tsx`は、ルーム切り替え時に`ChatRoom`・`AuthGate`を含む配下全体を強制リマウントする目的で追加した（前のルームの状態が残る問題、`AuthGate`のsessionStorage確認がroomId変化だけでは再チェックされない問題への対策。詳細は「Phase 17 の実装内容・詳細」参照）。ヘッダーを「変化しない部品」として保持し続ける設計にする場合、この強制リマウントとの整合性を再検討する必要がある。特に鍵付きルーム（`auth_required`）が絡む切り替えでは、ヘッダー等を残しつつ`AuthGate`の解錠状態だけは確実にリセットする、という両立が必要になり、単純な話ではない。次回着手する場合は、この点を最初に設計し直すこと

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

## ファイル構成（Phase 23時点）

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
│   ├── settings/page.tsx        # 追加認証・通知・DM受信設定画面（Phase 6。Phase 7で通知設定・DM受信設定を統合。永続サイドバーシェルには含まれない独立ページ）
│   ├── (shell)/                 # 永続サイドバーシェル（Phase 17・新規Route Group。URLには現れない）
│   │   ├── layout.tsx           # サイドバー（SidebarNav）のデータ取得・起動時ゲート判定。`/home`・`/chat/[roomId]`間のクライアント遷移で再マウントされない（Phase 19でget_group_conversation_listを統合、Phase 23でAddUserPanel+HomeTabsの組み立てをSidebarNav呼び出しに置換）
│   │   ├── home/page.tsx        # チャット未選択時のメインエリアのプレースホルダ（Phase 3〜16の実装はlayout.tsx/components/shell/へ移設済み。旧app/home/page.tsxから移動）
│   │   └── chat/[roomId]/
│   │       ├── page.tsx         # チャット画面（Phase 3。Phase 5でブロック状態取得、Phase 6で各チャットゲート分岐・非表示ID取得、Phase 17で起動時ゲートの独立チェックを追加＝直接URLバイパスの解消、Phase 18でDB問い合わせをPromise.allで並列化（4段階に圧縮）、Phase 19でroom.is_groupによるグループ/DM分岐を追加、Phase 21でグループ分岐にroleを追加。旧app/chat/[roomId]/page.tsxから移動）
│   │       └── template.tsx     # roomId切り替え時の強制リマウント用（Phase 17・新規）
│   ├── chat/[roomId]/hidden/page.tsx  # 非表示メッセージ一覧（Phase 6・新規。永続サイドバーシェルには含めない独立ページのまま。Phase 18で起動時ゲートの独立チェックを追加＝直接URLバイパスの解消、DB問い合わせをPromise.allで並列化）
│   └── actions/
│       ├── auth.ts              # signup/login/logout Server Actions（Phase 2）
│       ├── auth-secret.ts       # 追加認証（PIN/キー）設定・検証系 Server Actions（Phase 6・新規）
│       ├── rooms.ts             # startDirectMessageWithUser（Phase 5）+ toggleRoomAuthRequired/closeTempChat/startTemporaryDirectMessage（Phase 6）（Phase 8でデッドコードのstartDirectMessageを削除、Phase 19でcreateGroupRoomを追加、Phase 21でaddGroupMembers/removeGroupMember/leaveGroupを追加、Phase 22でtransferGroupOwnership/deleteGroupを追加）
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
│   │   └── AuthGate.tsx         # 追加認証の共通ゲート（Phase 6・新規。Phase 8でtry/catch化、Phase 16でPC幅のレイアウト崩れ修正・表示位置を数学的中央よりやや上寄りに調整。Phase 17でroomId切り替え時の再マウントをtemplate.tsx側で担保する設計に伴い無改修のまま活用）
│   ├── settings/
│   │   ├── AuthSettingsForm.tsx        # PIN/キー設定・スコープトグルフォーム（Phase 6・新規。Phase 8でtry/catch化・PIN入力属性追加）
│   │   └── NotificationSettingsForm.tsx # 通知設定・DM受信設定フォーム（Phase 7・新規。Phase 8でtry/catch化・エラー表示追加）
│   ├── pwa/                     # Phase 7・新規ディレクトリ
│   │   ├── ServiceWorkerRegistrar.tsx  # Service Worker登録（何も描画しない）
│   │   ├── OfflineBanner.tsx           # SRS 3.4オフラインバナー
│   │   └── InstallPrompt.tsx           # PWAインストール導線（beforeinstallprompt+iOSフォールバック）
│   ├── ui/                      # Phase 23・新規ディレクトリ
│   │   └── Modal.tsx            # 汎用モーダルラッパー（背景クリック・Escapeでonclose、role="dialog"）。CreateGroupPanel.tsx・CreateTempChatPanel.tsxが使用。既存のGroupMembersPanel.tsxは追従させていない
│   ├── shell/                   # Phase 17・新規ディレクトリ（永続サイドバーシェル本体）
│   │   ├── ShellRow.tsx         # サイドバー/メインのmd:分割。useSelectedLayoutSegmentでモバイル幅の表示切替を判定（Phase 23でサイドバー幅をmd:w-[32rem]→md:w-80に縮小、2カラム横並び用だったmd:flex-rowを削除）
│   │   ├── GatedShellBody.tsx   # 起動時ゲート有効時のクライアント側取得＋描画（旧components/home/HomeContent.tsxのGatedHomeBodyを移設・拡張。childrenも受け取る。Phase 19でget_group_conversation_listを統合、Phase 23でAddUserPanel+HomeTabsの組み立てをSidebarNav呼び出しに置換）
│   │   └── ShellFriendshipsSync.tsx  # 非ゲート時のfriendships Realtime購読（旧HomeContent.tsxの該当effectを移設）
│   ├── chat/
│   │   ├── ChatRoom.tsx             # チャット画面本体・Realtime購読・画像添付・ブロックUI・削除/非表示・オプションメニュー（Phase 3/4/5/6。Phase 8でtry/catch化・空状態・日付区切り等のUX修正、Phase 14でテキスト送信の自動リトライ（SRS 3.4）、Phase 17でルート要素をh-screenからh-full flex-1へ変更、Phase 19でotherUser単数propをpeer: ChatPeer判別共用体へ変更しグループ対応、Phase 21でgroupMembersローカルstate・メンバー管理モーダル配線を追加）
│   │   ├── MessageBubble.tsx        # メッセージ表示・長押し/右クリックメニュー（Phase 3/4/6。Phase 8で画像alt修正、Phase 9でキーボード操作対応を追加、Phase 19でsenderName propを追加）
│   │   ├── ChatRoomOptionsMenu.tsx  # チャットオプションメニュー（Phase 6・新規。Phase 8でtry/catch化・確認ダイアログ追加、Phase 21でpeer/onOpenMembers propsとグループの場合の「メンバー一覧」エントリを追加）
│   │   ├── GroupMembersPanel.tsx    # グループメンバー一覧・追加・削除・退出のモーダル（Phase 21・新規。Phase 22でオーナー譲渡・グループ削除を追加）
│   │   ├── GatedChatRoomLoader.tsx  # 各チャットゲート有効時のクライアント側取得（Phase 6・新規。Phase 8でメッセージ取得エラー処理を追加、Phase 18でDB問い合わせをPromise.allで並列化、Phase 19でisGroup propによるグループ/DM分岐を追加、Phase 21でグループ分岐にroleを追加）
│   │   └── HiddenMessagesList.tsx   # 非表示メッセージ一覧本体（Phase 6・新規。Phase 8でtry/catch化・画像alt修正）
│   └── home/                    # Phase 5・新規ディレクトリ
│       ├── SidebarNav.tsx       # サイドバー全体の合成コンポーネント（Phase 23・新規）。「検索」「一覧」タブの排他切替（PC/モバイル問わず）＋「＋」新規作成メニュー（グループ/一時チャット）＋選択中ビュー（AddUserPanelまたはHomeTabs）をまとめる。app/(shell)/layout.tsx・components/shell/GatedShellBody.tsxはこのコンポーネント経由でサイドバーを描画する
│       ├── HomeTabs.tsx         # 「一覧」タブの中身：すべて/フレンド/ストレンジャー/グループの4サブタブ・一時チャットバッジ（Phase 5/6。Phase 8でフレンド解除ボタン・取得エラー表示、Phase 9でFR-14検索フィルタ・レスポンシブレイアウト対応を追加。中身はPhase 17でも無変更のままシェルのsidebarスロットへ移設。Phase 19でConversationItemを判別共用体化しグループタブを有効化、CreateGroupPanelへの導線を追加。Phase 23で「すべて」タブ（統合ソート）を追加しデフォルト化、グループ作成導線をSidebarNav側の「＋」メニューへ移管、FR-14検索をグループにも拡張）
│       ├── AddUserPanel.tsx     # 「検索」タブの中身：ユーザー検索・フレンド申請・簡易ブロック（Phase 5/6。Phase 8でtry/catch化・ESLintエラー解消・検索0件表示、Phase 9でFR-15レスポンシブ配置（PCサイドバー/スマホボトムバー）、Phase 13でPC常時展開、Phase 16で検索結果のレイアウト崩れ・申請中メッセージボタン消失を修正。Phase 23で開閉chrome（open state・固定配置・PC常時展開スタイル）と一時チャット期限選択UIを削除し、表示制御をSidebarNav側に委ねる単純な内容物に縮小。有効期限UIはCreateTempChatPanel.tsxへ移設）
│       ├── CreateGroupPanel.tsx # グループ作成モーダル（Phase 19・新規）。検索結果の複数選択→createGroupRoom呼び出し。Phase 23でサイドバー「＋」メニューから開くモーダルに変更（旧：HomeTabs.tsxのグループタブ内インライン展開）。components/ui/Modal.tsxでラップ
│       ├── CreateTempChatPanel.tsx # 一時チャット作成モーダル（Phase 23・新規）。旧AddUserPanel.tsxの検索結果行にあった有効期限セレクターを、単一選択の検索フローに載せ替えて独立させたもの。サイドバー「＋」メニューから開く
│       └── HomeHeader.tsx       # ホーム画面ヘッダー（ロゴ・ユーザー名・設定/ログアウト導線）（Phase 16・新規。Phase 17でapp/(shell)/layout.tsx・components/shell/GatedShellBody.tsxから呼ばれる形に変更）
├── types/
│   └── supabase.ts              # Supabase生成型定義（Phase 3で導入、Phase 5/6で再生成）
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
│   └── sw.js                    # 最小構成Service Worker（Phase 7・新規）
├── docs/
│   ├── srs.md                   # 要件定義（正。Phase 8でlock_type/lock_secret・auth_requiredの記載を実態に合わせて更新。Phase 15で検索タブ・FR-4/FR-14・エラー形式・3.9テスト要件・Future Extensionsの計5箇所を実態に整合）
│   └── schema.sql               # DBスキーマ参照用ファイル（Phase 6のRPC・列、Phase 8のanon revokeを追記）
├── proxy.ts                     # ルート保護・セッションリフレッシュ（Phase 2。Phase 7でmatcherにsw.js除外を追加。Route Group導入後もpathnameベースのmatcherは無変更で機能）
├── next.config.ts               # 画像remotePatterns（Phase 4）+ sw.js用headers（Phase 7）
├── .env.example                 # Phase 8で未使用のNEXT_PUBLIC_APP_URLを削除
└── CLAUDE.md（このファイル）
```

（`components/chat/NewDmForm.tsx`はPhase 5で`AddUserPanel`に統合されたため削除済み。`components/home/StrangerDmToggle.tsx`はPhase 7で`NotificationSettingsForm`に統合されたため削除済み。`app/actions/rooms.ts`の`startDirectMessage`関数はPhase 8でデッドコードとして削除済み。`components/home/HomeContent.tsx`はPhase 17で`components/shell/`へ移設・分割されたため削除済み）

## 次にやること（Phase 23・未確定）

**Phase 15をもって、現行スコープでの「一旦完成・既知の問題なし」という区切りに到達した。** ここから先は新機能・仕様変更のラウンドとして扱う（ユーザー自身の言葉：「とりあえず完成、一旦問題はない、という状態に持っていって、そこから今後、新機能や仕様変更等の作業をする」）。Phase 16でUIバグ3件を修正しつつナビゲーション構造刷新の構想が寄せられ、Phase 17でその構想をNext.js実物ドキュメントで裏取りしたうえでM1（永続サイドバーシェルの骨組み）まで実装、Phase 18でチャット切り替え速度改善と起動時ゲートバイパス修正、Phase 19でグループチャットUI M1、Phase 20でeslint/typescript再チェック、Phase 21でグループチャットM2（メンバー管理）、Phase 22でグループチャットM3（オーナー譲渡・グループ削除）、Phase 23でサイドバーUI再設計（検索/一覧タブ排他切替・＋新規作成メニュー）を実装した。

以下は次ラウンドの候補（優先度未確定）。ユーザーから「許可不要で計画→実装を繰り返してよい、コミットも自由に行ってよい」との承認済み（2026-08-12）のため、次回セッションでは基本的にこのリストから妥当なものを選んで自律的に進めてよい：

1. ~~ナビゲーション構造刷新M1（Phase 17実装分）の実機確認~~ → **実機確認済み（2026-08-13）。** 問題なし。ヘッダー非表示化・AuthGate位置調整も含めすべて確認完了
2. ~~チャット切り替え時の体感速度改善（クエリ並列化）~~ → **Phase 18で対応済み（2026-08-13）。** `app/(shell)/chat/[roomId]/page.tsx`・`components/chat/GatedChatRoomLoader.tsx`の直列DB問い合わせを`Promise.all`で4段階に圧縮。詳細は「Phase 18 の実装内容・詳細」参照。実機での体感速度改善確認は次回ユーザー確認待ち。ヘッダー/入力欄を再読み込みしないSuspense分離案（`template.tsx`の強制リマウント設計との整合性検討が必要）は引き続き未着手・候補として残す
3. ~~グループチャットUI（FR-4）M1の実装~~ → **Phase 19で対応済み（2026-08-13）。** グループ作成・一覧表示・送信者名表示付きメッセージ送受信を実装。詳細は「Phase 19 の実装内容・詳細」参照。DB層は`execute_sql`での直接検証済み、実機でのUI操作確認は次回ユーザー確認待ち。メンバー管理UI（追加・削除・退出）は次のM-phase候補
4. ~~サイドバー内部UIの再設計~~ → **Phase 23で対応済み（2026-08-14）。** 「検索」「一覧」タブの排他切替（PC/モバイル問わず、Phase13のPC常時展開は撤回）＋「＋」新規作成メニュー（グループ作成・一時チャット作成）＋「一覧」タブの統合「すべて」ビューを実装。詳細は「Phase 23 の実装内容・詳細」参照。実機確認は次回ユーザー確認待ち。**残る候補：** `GroupMembersPanel.tsx`のModal.tsx追従、サイドバー幅`md:w-80`の実機調整、`docs/srs.md` 3.2.1節の検索タブ注記の整合
5. **実機フィードバックで見つかった小粒課題群：** 「検討中のアイデア」節4.参照（ホームへ戻るUI、一時チャットの命名・複数保持・チャット画面からの作成、スクロールバー、プロフィール概念、既読機能、タブUI統一方針）。優先度未確定のため、着手する場合はユーザーと相談のうえ妥当なものから選ぶ
6. ~~`/chat/[roomId]/hidden/page.tsx`の起動時ゲートバイパス修正~~ → **Phase 18で対応済み（2026-08-13）。** 詳細は「Phase 18 の実装内容・詳細」内の該当節を参照。実機確認は次回ユーザー確認待ち
7. ~~`eslint`（9→10）・`typescript`（6.0→7系）のメジャー更新の再挑戦~~ → **Phase 20で再チェック済み（2026-08-13）。継続ブロック、状況変化なし。** `eslint-plugin-react`のPR #4022は依然オープン（メンテナ最終アクション待ち）、TypeScript 7.1も未リリース。次回はPR #4022のマージ有無・TypeScript 7.1リリースから確認するとよい（詳細は「Phase 20 の実装内容・詳細」参照）
8. ~~グループチャットUI M2（メンバー管理）~~ → **Phase 21で対応済み（2026-08-13）。** メンバー一覧・追加・削除・退出を実装。詳細は「Phase 21 の実装内容・詳細」参照
8b. ~~グループチャットUI M3（オーナー譲渡・グループ削除）~~ → **Phase 22で対応済み（2026-08-14）。** 詳細は「Phase 22 の実装内容・詳細」参照。実機確認は次回ユーザー確認待ち。**残る候補（M4以降）：** グループ名変更・アバター設定等のプロフィール編集機能、`messages_insert_member_not_blocked`の過剰に強いブロック挙動の見直し
9. **デプロイ（将来・ユーザー指示待ち）：** Vercelへの本番デプロイ。`.env.example`を参考に環境変数を設定。SRS 2.5「無料プランでの運用を前提とする」を踏まえたVercelプランの確認。**ユーザーより明示的な指示済み（2026-08-12）：「デプロイは、私が指示しない限り行いません。数カ月後になると思います。」** 他の未実装機能が出揃った・地固めが済んだといった状況証拠だけでは着手判断とせず、自律的な計画→実装→コミットの承認範囲にもデプロイは含まれない。ユーザーから明示的な着手指示があるまでは、バックログに置いておくのみに留める
10. **自動テスト基盤の導入：** Phase 15でユーザーに確認し、現時点では見送り・従来通りの手動QA運用継続で確定済み（`docs/srs.md` 3.9節にも運用実態を明記済み）。**この決定は蒸し返す必要はない。** グループチャットUI M1が実装され既存機能への影響範囲が実際に広がったため、次回セッションで改めて要否を検討する候補として繰り上げてもよい

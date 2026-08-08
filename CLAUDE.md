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
| 5     | フレンド・ストレンジャー・ブロック                                         | 次はこれ |
| 6     | 一時チャット・追加認証・非表示メッセージ                                   | 未着手   |
| 7     | 通知設定・PWA仕上げ・デプロイ                                              | 未着手   |

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
- `components/chat/ChatRoom.tsx` — チャット画面のClient Component。メッセージ送受信・Realtime購読・ページング・textarea自動リサイズ（**Phase 4で画像添付機能を追加**）
- `components/chat/MessageBubble.tsx` — メッセージ1件分の表示（**Phase 4でCloudinary配信URL対応**）

### DB変更

- RPC関数 `get_or_create_dm_room(p_other_user_id uuid) returns uuid` を追加（`docs/schema.sql`に追記済み）。`rooms` + `room_members`への複数INSERTをアトミックに行い、既存DMがあればそれを返す（重複ルーム防止）。他のヘルパー関数と同じくSECURITY DEFINER + `authenticated`のみEXECUTE許可のパターン
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

- ルーム一覧（`app/home/page.tsx`の`fetchRoomList`）のクエリがN+1気味。Phase 5でフレンド機能を実装する際に、ビュー化またはRPC化を検討する
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

### 動作確認してほしい項目（実機確認用チェックリスト）

1. `.env.local`にCloudinaryの3値（`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`）を設定してから`npm run dev`
2. チャット画面で画像添付ボタン（📎アイコン）→ ファイル選択 → プレビュー表示 → 送信、の一連の流れ
3. テキスト＋画像を同時送信できること／画像のみ送信できること
4. 5MB超のファイル・非対応形式（例：HEIC）を選んだ際にエラーメッセージが表示され、送信されないこと
5. JPEG/PNG/WebPが違和感のない画質でリサイズ・表示されること、GIFのアニメーションが送信後も再生されること
6. 画像アップロード中にアプリを閉じたり、意図的にネットワークを切って失敗させた場合、「画像のアップロードに失敗しました」等のエラーが出て、選択した画像が消えずに再送信できること
7. Cloudinaryダッシュボードの Media Library に `tiliqua/rooms/{roomId}` フォルダで画像が保存されていること
8. 2画面でRealtime反映（片方で画像送信→もう片方に届く）が引き続き問題ないこと

### 実機テストで見つかったバグと修正（Phase 4完了後）

1. **GIFが送受信できない（表示が空に見える）**
   原因：`lib/cloudinary/url.ts`の表示用変換で、全画像に`f_auto,q_auto,w_{width}`を一律適用していた。Cloudinaryはアニメーション画像に変換をかける際、`fl_animated`フラグを付けない限り**デフォルトで先頭フレームのみ**を配信する仕様があり、多くのGIFは先頭フレームが空白/透明であることが多いため「何も表示されない」ように見えていた（Cloudinary側には正しく保存されていたのはこのため）。
   修正：URLが`.gif`で終わる場合のみ`f_auto,fl_animated,q_auto,w_{width}`を適用するよう`buildChatImageUrl`を変更。`f_auto`と`fl_animated`の併用で、対応ブラウザにはアニメーションWebPとして（非対応ならGIFのまま）アニメーションを保ったまま配信される。

2. **新着メッセージ受信時、画面が最新の状態までスクロールされない（少し上で止まる）**
   原因：`setMessages(...)`の直後に同期で`bottomRef.current?.scrollIntoView()`を呼んでいたが、Reactの状態更新はDOMへの反映が次のコミットまで非同期のため、その時点ではまだ新しいメッセージがDOMに挿入されていない。結果として「新メッセージ追加前の一番下」を基準にスクロールしてしまい、実際に新メッセージが挿入された後は少し上で止まって見えていた（テキスト・画像どちらでも発生。画像特有の問題ではなかった）。
   修正：`pendingScrollToBottomRef`（bool）を新設し、Realtime受信時・自分の送信成功時にはこのrefをtrueにするだけにした。実際のスクロールは`messages`の更新を検知する`useLayoutEffect`側（＝DOMへのコミット後）で行うことで、常に正しい最下部へ届くようにした。既存の「過去メッセージ読み込み時のスクロール位置維持」（`pendingScrollAdjustRef`）と同じ設計パターンに揃えた形。

3. **過去メッセージを読んでいる最中でも、新着メッセージが来ると強制的に最下部へスクロールされてしまう**
   要望：スクロール位置がすでに最下部付近にある場合だけ自動スクロールし、意図的に上へスクロールして過去ログを読んでいる場合は割り込まないでほしい。
   対応：`isScrolledNearBottom()`（`scrollHeight - scrollTop - clientHeight <= 120px`で判定）を追加し、**Realtime受信時のみ**、新メッセージがDOMに追加される前の時点でこの判定を行い、最下部付近にいた場合だけ`pendingScrollToBottomRef`を立てるようにした。一方、**自分がメッセージを送信したときは、閲覧中のスクロール位置に関わらず常に最下部へ移動する**（自分の送信内容は必ず見せたいため、他の一般的なチャットアプリと同じ挙動）。この非対称な扱いは意図的な設計。

### 未対応・持ち越し事項（Phase 4時点）

- サインアップ画面（`app/signup/page.tsx`）のアバターアップロードは今回は対応せず。必要になったタイミングで`lib/cloudinary`の署名フローを流用して追加する
- アップロード進捗の%表示（現状は状態文言のみ）
- テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）は未実装
- 画像のみのメッセージに対する`MessageHidden`（非表示）・削除機能はPhase 6で対応予定（Phase 3からの持ち越しと同じ）

## 検討中のアイデア・未確定のPhase割り当て

以下はPhase 4完了後の会話で出た検討事項。SRS本文にはまだ反映していない、あるいはどのPhaseにも割り当てが確定していないものなので、次にPhase構成を見直すタイミング（Phase 5開始時など）で扱いを決めること。

### 1. どのPhaseにも未割り当てのSRS要件

- **グループチャットUI（FR-4）：** DB・RLSはグループ対応済みだが、`app/chat/[roomId]/page.tsx`は「DM相手1人」前提のまま実装されている。Phase 5（フレンド機能でルーム一覧を触るタイミング）と一緒にするか、独立したPhaseにするか未決定
- **テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）：** 画像アップロード失敗時の手動リトライ（選択中の画像・本文を保持したまま再送信可）はPhase 4で対応済みだが、テキスト送信そのものの自動リトライは未実装・未割り当て
- **真の楽観的更新**（送信直後に仮IDで即座に表示 → サーバー確定後に差し替え）：Phase 3から持ち越しのメモはあるが、Phase未割り当て。体感速度に関わるため、Phase 7「低スペック最適化」とまとめるのが良さそうという話が出た

### 2. 複数チャットレイアウト対応（新規アイデア・未実装）

本人からの提案：現在のLINE風（自分は右・相手は左、吹き出し）以外に、Discord風（全員左揃え、非吹き出し）など、複数のチャットレイアウトから選べるようにしたい。SRS本文には未記載だが、Future Extensions「UIテーマ切り替え」の延長線上のアイデアとして位置づけられる。

**議論の要点：**

- DB設計への影響はほぼなし。`messages`テーブルの構造は変わらず、`components/chat/MessageBubble.tsx`など表示層コンポーネントの差し替えだけで実現できる
- 低スペック端末への影響もほぼゼロ（CSS/DOM構造の違いのみ）。SRSの軽量設計方針と矛盾しない
- **グループチャットUI（上記1.）との相性を考慮すべき。** Discord風レイアウトは「誰が発言したか」を毎メッセージに表示する前提の設計であり、現状は1対1 DMのみなので価値が出にくい。グループチャットUI実装後に着手するのが自然という結論になった
- 最初から汎用的な「レイアウトプラグイン機構」のように作り込むのは、このアプリの規模に対して過剰設計。まずはLINE風・Discord風の2種類の切り替えだけ実装し、3種類目以降は後から追加コンポーネントとして足していく方針でよい、という方向性で合意
- 設定の保存場所は`user_settings`に新カラム（例：`chat_layout`）を追加する形が、既存の`dm_from_stranger_enabled`等と同じパターンで自然。ルーム単位ではなくユーザー単位の設定にする想定

**Phase位置づけの見立て：** グループチャットUI実装後、Phase 7の仕上げか独立Phaseとして検討。今すぐ決定する必要はない。

**`docs/srs.md`への反映：** 未実施。Future Extensionsの「UIテーマ切り替え」を「UIテーマ・チャットレイアウト切り替え」のように具体化する案が出ているが、実際に編集するかはユーザーの判断待ち。Phase 5開始時、あるいは上記1.の3項目を正式にPhase割り当てするタイミングで一緒に検討する。

## 開発上の重要な原則

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する
- **MXバイパス：** `signUp()`は使わず`adminClient.auth.admin.createUser()` + `email_confirm: true`を使う
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`を忘れずに実行する
- **トリガーの`search_path`：** authスキーマ配下から実行されるトリガー関数は`SET search_path = public`が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せずSupabaseクライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する（Cloudinaryの署名発行も同じ原則。ただしファイル本体はRoute Handlerを経由させず、ブラウザから直接Cloudinaryへ送る）
- **Realtime対象テーブルの登録を忘れない：** 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れずに行う
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
│   ├── api/
│   │   └── cloudinary/
│   │       └── sign/route.ts    # Cloudinary署名発行（Phase 4）
│   ├── login/page.tsx           # ログイン画面（Phase 2）
│   ├── signup/page.tsx          # サインアップ画面（Phase 2）
│   ├── home/page.tsx            # チャット一覧画面（Phase 3）
│   ├── chat/[roomId]/page.tsx   # チャット画面（Phase 3）
│   └── actions/
│       ├── auth.ts              # signup/login/logout Server Actions（Phase 2）
│       └── rooms.ts             # startDirectMessage Server Action（Phase 3）
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # ブラウザ用クライアント
│   │   ├── server.ts            # Server Component/Action用クライアント
│   │   └── admin.ts             # service_role用クライアント
│   ├── cloudinary/              # Phase 4
│   │   ├── sign.ts              # 署名生成（サーバー専用）
│   │   ├── upload.ts            # クライアント→Cloudinary直接アップロード
│   │   └── url.ts               # 表示用URL変換ヘルパー
│   └── images/
│       └── compress.ts          # 送信前バリデーション・リサイズ（Phase 4）
├── components/
│   ├── TiliquaMark.tsx          # ブランドロゴ
│   └── chat/
│       ├── ChatRoom.tsx         # チャット画面本体・Realtime購読・画像添付（Phase 3/4）
│       ├── MessageBubble.tsx    # メッセージ表示（Phase 3/4）
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

## 次にやること（Phase 5）

フレンド・ストレンジャー・ブロック機能。SRS FR-11〜FR-13、FR-15、FR-22、FR-23、3.5「検索対象の定義」を参照。

1. `friendships`（申請・承認・拒否・既読バッジ）と`blocks`テーブルはPhase 1で作成済み。RLSも設定済みなので、UIとServer Action/クエリの実装が中心になる
2. `app/home/page.tsx`のチャット一覧を「フレンド／ストレンジャー／グループ／検索」の4タブ構成に拡張（SRS 3.2.1）
3. 現状DM相手は無条件に表示されているが、フレンド関係の有無に応じて「フレンド一覧」「ストレンジャー一覧」に振り分ける
4. `fetchRoomList`（Phase 3からのN+1の持ち越し）をこのタイミングでビュー化・RPC化するか判断する
5. ユーザー追加UI（ユーザーIDでフレンド申請 or DM開始）は`components/chat/NewDmForm.tsx`をベースに拡張、または新規コンポーネント化
6. ブロック機能実装時は、既存の`is_blocked()`ヘルパー関数・`get_or_create_dm_room`のブロックチェックが既に組み込み済みであることを確認しながら進める

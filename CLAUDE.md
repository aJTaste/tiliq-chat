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
| @supabase/ssr         | ^0.12.4（Phase 2で追加）                                     |
| @supabase/supabase-js | ^2.112.0（Phase 2で追加）                                    |
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

## Next.js 16 の破壊的変更（重要）

- **`middleware.ts` は廃止され `proxy.ts` になった。** エクスポート名は`proxy`（named export。default exportも可）。Phase 2で実装済み。実際にnpmパッケージ（next@16.2.12）のドキュメントを取得して仕様確認済み：`request.cookies` / `response.cookies` APIは旧middlewareと同一、デフォルトでNode.jsランタイム（Edgeランタイム限定ではない）
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
| 3     | チャットのコア機能（Room・メッセージ送受信・Realtime）                     | 次はこれ |
| 4     | 画像送信（Cloudinary連携）                                                 | 未着手   |
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
- `app/home/page.tsx` — 認証確認用の仮画面（**Phase 3で実際のチャット一覧画面に置き換え予定**）

### 設計判断・学び

- **`@supabase/ssr`は`get`/`set`/`remove`が非推奨化されており、`getAll`/`setAll`パターンが正。** 古いSupabaseチュートリアルのコードをそのまま使うと警告が出るので注意
- **ログインはユーザーID or 登録済み実メールアドレスの両方を受け付ける。** 実メールの場合は`user_settings.email` → `profiles.username`をadminクライアントで逆引きし、内部ドメインメール（`{username}@tiliqua.app`）に変換してから`signInWithPassword`を呼ぶ
- **サインアップ時のユーザーID重複チェックはadminクライアント（service_role）で実施。** `profiles`のRLSは`to authenticated`のみのため、未認証状態（サインアップ前）では読めないため
- **パスワードは最低8文字。** SRSに複雑さ要件の明記が無いための暫定値（必要なら変更可能）
- Server Actionsを採用（Route Handlerではなく）。App Router公式ドキュメントでもフォーム認証にはServer Actions + `useActionState`が推奨パターン。SRS 3.2.2の認証APIの実装方式欄も他行と異なり「Supabase Auth」としか書かれておらずRoute Handler限定ではないため、齟齬なし

### 動作確認結果

ユーザーが実機で確認済み：サインアップ→`/home`へリダイレクト→ログアウト→再ログイン→未ログイン時に保護ルートへアクセスすると`/login`へリダイレクト、すべて正常動作。

### 未対応・持ち越し事項

- Supabaseの型定義生成（`generate_typescript_types`）は未実施。Phase 3の早い段階で`types/supabase.ts`として生成し、各Supabaseクライアントに型を適用するとよい
- アバターアップロードはサインアップフォームから外してある（Cloudinary未連携のためPhase 4で対応）

## 開発上の重要な原則

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する
- **MXバイパス：** `signUp()`は使わず`adminClient.auth.admin.createUser()` + `email_confirm: true`を使う（Phase 2で実装済み）
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`を忘れずに実行する（Phase 1で実施済み）
- **トリガーの`search_path`：** authスキーマ配下から実行されるトリガー関数は`SET search_path = public`が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せずSupabaseクライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する
- **コミット：** Conventional Commits形式でコミットする
- **破壊的変更の確認：** Next.js等のバージョン依存の仕様に不安がある場合、AGENTS.mdの指示通り実物のドキュメント（npmパッケージから取得可能）を確認してからコードを書く

## ファイル構成（現時点）

```
tiliq-chat/
├── app/
│   ├── layout.tsx          # フォント・メタデータ・PWA設定
│   ├── page.tsx             # アプリ紹介ページ（SRS 3.2.1）
│   ├── globals.css          # デザイントークン・Tailwind v4設定
│   ├── favicon.ico
│   ├── login/page.tsx       # ログイン画面（Phase 2）
│   ├── signup/page.tsx      # サインアップ画面（Phase 2）
│   ├── home/page.tsx        # 認証確認用の仮画面（Phase 3で置き換え予定）
│   └── actions/
│       └── auth.ts          # signup/login/logout Server Actions（Phase 2）
├── lib/
│   └── supabase/
│       ├── client.ts        # ブラウザ用クライアント（Phase 2）
│       ├── server.ts        # Server Component/Action用クライアント（Phase 2）
│       └── admin.ts         # service_role用クライアント（Phase 2）
├── components/
│   └── TiliquaMark.tsx      # ブランドロゴ
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
├── docs/
│   ├── srs.md               # 要件定義（正）
│   └── schema.sql           # DBスキーマ参照用ファイル
├── proxy.ts                  # ルート保護・セッションリフレッシュ（Phase 2）
├── .env.example
└── CLAUDE.md（このファイル）
```

`types/`（Supabase型定義）はまだ未追加。Phase 3で対応予定。

## 次にやること（Phase 3）

チャットのコア機能：Room作成・メッセージ送受信・Realtime購読。

1. Supabaseの型定義生成（`generate_typescript_types`ツールが使える）→ `types/supabase.ts`として保存し、各クライアントに型適用
2. Room作成（DM・グループ）の実装。`rooms` / `room_members`のinsertは特権寄りの操作のため、Route Handler or Server Actionどちらが適切か要検討
3. メッセージ送受信のコア実装。**ホットパス（送信・取得）はRoute Handlerを経由せずSupabaseクライアント直接呼び出し**（既存原則どおり）
4. Supabase Realtimeの購読実装（チャット画面表示時のみ購読開始、離脱時に解除）
5. メッセージのページング（20〜50件、無限スクロールまたはページング）
6. **Phase 3時点ではフレンド機能（Phase 5）が未実装のため、動作確認用に「ユーザーIDを指定して簡易にDMを開始する」暫定UIを用意する**（本格的なフレンド申請フローはPhase 5で作り直す前提）
7. `app/home/page.tsx`を実際のチャット一覧画面に置き換える

@AGENTS.md

# Tiliqua — 開発コンテキスト

このファイルはセッション間で開発の文脈を引き継ぐためのものです。作業開始前に必ず目を通してください。

## プロジェクト概要

- **アプリ名：** Tiliqua（アオジタトカゲの学名。並び替えると "Qualiti" = quality）
- **リポジトリ名：** tiliq-chat（`tiliqua` の意図的な短縮。本人はこの略し方を他でも使用）
- **目的：** プライバシー重視・軽量設計のチャットアプリ。低スペック端末（学校PC含む）でも快適に動作し、広告なし・外部サービス連携なしで運用する
- **要件定義：** [`docs/srs.md`](./docs/srs.md) が正。仕様に迷ったら必ずこちらを参照する
- **開発体制：** コーディングは基本的にClaudeがすべて担当する。ユーザーはUIの確認・動作確認・意見出しを担当（従来の「学びながら一緒に書く」スタイルから変更）
- **前身プロジェクト：** 同じ内容で `tiliqua-chat` というリポジトリで開発していたが、いったん削除し `tiliq-chat` として作り直した。DBスキーマ・認証フローも含めて実装はゼロから作り直す
- **開発環境：** ターミナルはUbuntu（WSL）。プロジェクトはWSL内に配置。bashコマンド・パス指定はWSL/Linux前提
- **会話の切り替え運用：** Claude利用制限を抑えるため、Phaseや作業のまとまりごとに会話を切り替える。区切りの良いところに達したら、会話が終わる前に必ずこのファイル（および必要ならメモリ）に進捗・次にやるべきことを反映すること

## 技術スタック（バージョン確定）

| 項目           | バージョン                                                   |
| -------------- | ------------------------------------------------------------ |
| Next.js        | 16.2.12（App Router）                                        |
| React          | 19.2.4                                                       |
| Tailwind CSS   | 4.3.3（CSS-first設定、`@theme` を `app/globals.css` に記述） |
| TypeScript     | ^5                                                           |
| Node.js        | 22系                                                         |
| パッケージ管理 | npm                                                          |

## Supabaseプロジェクト（Phase 1で作成）

| 項目           | 値                                         |
| -------------- | ------------------------------------------ |
| プロジェクト名 | `tiliq-chat`                               |
| project ref    | `xewprddypddcxkwvcytu`                     |
| リージョン     | ap-northeast-1（東京）                     |
| Project URL    | `https://xewprddypddcxkwvcytu.supabase.co` |
| 料金           | 無料プラン（月額0円）                      |

※ 前身プロジェクト（旧リポジトリ名の `tiliqua-chat`・休止中）は再利用せず、新規に作り直した。旧プロジェクトは未削除のまま放置している（必要なら後で手動削除）。

`.env.local` には以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://xewprddypddcxkwvcytu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_VIxVf8bWwth8Afc_ojKkug_FJdQknnz
SUPABASE_SERVICE_ROLE_KEY=（Supabaseダッシュボード → Project Settings → API Keysから手動取得。MCP経由では取得不可）
```

## Next.js 16 の破壊的変更（重要）

- **`middleware.ts` は廃止され `proxy.ts` になった。** エクスポート名も `proxy`（または default export）。まだ作成していない（Phase 2で認証チェック用に追加予定）
- **Cache Components（`cacheComponents: true`）はオプトインの新キャッシュモデル。** このプロジェクトでは有効化していない（デフォルトの動的レンダリングのままにしている）。理由：チャット・認証まわりはほぼ全てユーザー個別のデータで、静的キャッシュが馴染まないため
- 破壊的変更は多いため、実装前に `node_modules/next/dist/docs/` 配下の該当ドキュメントを確認すること（`AGENTS.md` の指示どおり）

## デザイントークン（`app/globals.css`）

ブランドコンセプトは「地味な帯模様の体に、驚いたときだけ覗く鮮やかな青い舌」＝アオジタトカゲそのもの。ベースは落ち着いた石・帯模様のニュートラルカラー、アクセントの "tongue" ブルーだけを意図的に希少に使う。

| トークン           | 役割                                              | Light     | Dark      |
| ------------------ | ------------------------------------------------- | --------- | --------- |
| `--surface`        | 背景                                              | `#eae7dd` | `#1b1916` |
| `--surface-raised` | カード等の背景                                    | `#f5f3ec` | `#252220` |
| `--ink`            | 本文テキスト                                      | `#201d19` | `#ede8de` |
| `--ink-muted`      | 補助テキスト                                      | `#5c564c` | `#aba294` |
| `--band`           | 罫線・区切り                                      | `#c7bca3` | `#4a443b` |
| `--clay`           | 装飾アクセント（控えめに使用）                    | `#8b4331` | `#c97a54` |
| `--tongue`         | シグネチャーカラー（CTA・リンク・強調に限定使用） | `#2451c4` | `#6e93f0` |

ライト/ダークは `prefers-color-scheme` に自動追従（手動テーマ切替はSRS上も対象外＝Future Extensions）。

フォント：`--font-display`（Space Grotesk・見出し用）、`--font-body`（Inter・本文、`body`に既定適用）、`--font-label`（IBM Plex Mono・ラベルやメタ情報用、図鑑の標本ラベルのようなトーン）。

トップページ（`app/page.tsx` + `components/TiliquaMark.tsx`）にこのブランドの実装例あり。今後の画面もこのトークンを使って統一する。

## 開発フェーズ

| Phase | 内容                                                                       | 状態     |
| ----- | -------------------------------------------------------------------------- | -------- |
| 0     | プロジェクト基盤（Next.js / Tailwind / PWA / アイコン / ブランドトークン） | **完了** |
| 1     | Supabaseプロジェクト設定・DBスキーマ（9テーブル）・RLS・トリガー           | **完了** |
| 2     | 認証フロー（サインアップ・ログイン・ログアウト・`proxy.ts`）               | 次はこれ |
| 3     | チャットのコア機能（Room・メッセージ送受信・Realtime）                     | 未着手   |
| 4     | 画像送信（Cloudinary連携）                                                 | 未着手   |
| 5     | フレンド・ストレンジャー・ブロック機能                                     | 未着手   |
| 6     | 一時チャット・追加認証（PIN/キー）・非表示メッセージ                       | 未着手   |
| 7     | 通知設定・PWA仕上げ（Service Worker）・低スペック最適化・デプロイ          | 未着手   |

## Phase 1 の実装内容・詳細

DBスキーマは `docs/schema.sql` に全マイグレーション統合版を保存済み（実際の適用はSupabase側でmigration履歴として管理）。

### テーブル構成（9テーブル）

`profiles` / `user_settings` / `rooms` / `room_members` / `messages` / `message_hidden` / `friendships` / `blocks` / `temp_chat_sessions`

SRSの `User` モデルは `profiles`（公開情報）と `user_settings`（非公開情報・認証情報）に分割。

### SRSデータモデルからの追加カラム（要確認）

SRS 3.5 のデータモデルに明記が無いが、FR-19/FR-20（追加認証の割り当て・失敗ロック）を満たすために `user_settings` へ以下を追加した。仕様として問題なければこのままでOK：

- `auth_scope_launch` / `auth_scope_hidden_list`（アプリ起動時・非表示一覧への認証割り当てのON/OFF。各チャット単位の割り当ては `rooms.lock_type` で対応）
- `auth_failed_attempts` / `auth_locked_until`（5回連続失敗時のロック管理。解除方法は未確定のためタイムスタンプ保持のみ実装）

### RLS設計の要点

- 全ポリシーは `to authenticated` のみに限定（`anon` は一切アクセス不可）
- `room_members` など自己参照的なRLSで無限再帰を避けるため、`is_room_member()` / `is_room_owner()` / `is_blocked()` を `SECURITY DEFINER` のヘルパー関数として切り出すパターンを採用（Supabase公式の定番パターン）
- 論理削除されたメッセージ（`deleted_at IS NOT NULL`）はRLSレベルで送信者・受信者どちらにも見せない
- メッセージ非表示（`message_hidden`）はRLSではなくアプリケーションクエリ側でフィルタする設計（本人が後で復元する必要があるため、RLSで一律非表示にはできない）
- メッセージ送信はブロック関係がある相手が同ルームにいる場合は `WITH CHECK` で拒否

### 今回学んだ新しい注意点（追記）

- **SECURITY DEFINER関数のRPC直接実行に注意：** `SECURITY DEFINER` かつ `public` schema配下の関数は、デフォルトで `anon`/`authenticated` から `/rest/v1/rpc/関数名` として直接叩けてしまう（Supabase Advisorが警告）。RLSポリシー内部からの呼び出しには `authenticated` へのEXECUTE権限だけあれば十分なので、`REVOKE ... FROM public` → `GRANT ... TO authenticated` で絞ること
- **トリガー関数もEXECUTE権限を絞れる：** `handle_new_user()` のような認証トリガー専用の関数は、`authenticated`/`anon` 双方から `REVOKE EXECUTE` しても問題ない（トリガー自体はロールのEXECUTE権限に関係なく発火するため）
- **RLSポリシーの `WITH CHECK (true)` はAdvisorに警告される：** 意図的な「ログイン済みなら誰でも作成可」という設計でも、`WITH CHECK (auth.uid() is not null)` のように明示的な条件式に書き換えると警告が消える（挙動は同じ）
- **`get_advisors` の結果は数分キャッシュされることがある：** 修正直後に再実行しても古い警告が残る場合があるので、`apply_migration` が `success: true` を返していれば反映されていると判断してよい

## 開発上の重要な原則（前身プロジェクトからの引き継ぎ）

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する。RLSは行レベルで機能するため、列単位で公開範囲を分けたい場合はテーブルを分ける
- **MXバイパス：** `signUp()` は内部ドメインメール（`{username}@tiliqua.app`）だとMXレコード検証で弾かれるため、`adminClient.auth.admin.createUser()` + `email_confirm: true` を使う。Phase 1のトリガー（`handle_new_user`）は `raw_user_meta_data` から `username` / `display_name` / `avatar_url` / `real_email` を受け取る前提で実装済みなので、Phase 2のsignUp実装時はこれらを `user_metadata` に渡すこと
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` を忘れずに実行する（Phase 1で実施済み）
- **トリガーの`search_path`：** `handle_new_user()` のようなauthスキーマ配下から実行されるトリガー関数は `SET search_path = public` が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せず Supabase クライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する
- **コミット：** Conventional Commits形式でコミットする

## ファイル構成（現時点）

```
tiliq-chat/
├── app/
│   ├── layout.tsx        # フォント・メタデータ・PWA設定
│   ├── page.tsx           # アプリ紹介ページ（SRS 3.2.1）
│   ├── globals.css        # デザイントークン・Tailwind v4設定
│   └── favicon.ico
├── components/
│   └── TiliquaMark.tsx    # ブランドロゴ（ホバーで "Qualiti" が覗く）
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
├── docs/
│   ├── srs.md              # 要件定義（正）
│   └── schema.sql          # DBスキーマ参照用ファイル（Phase 1で追加）
├── .env.example
└── CLAUDE.md（このファイル）
```

`lib/supabase/`（client.ts / server.ts / admin.ts）、`types/`、`proxy.ts` はPhase 2で認証フローの実装とあわせて追加する。

## 次にやること（Phase 2）

1. `@supabase/ssr` パッケージの導入
2. `lib/supabase/client.ts`（ブラウザ用）・`lib/supabase/server.ts`（Route Handler / Server Component用）・`lib/supabase/admin.ts`（service_role用、admin.createUser利用）の実装
3. サインアップ：`adminClient.auth.admin.createUser()` + `email_confirm: true` でMXバイパス。`user_metadata` に `username` / `display_name` / `avatar_url` / `real_email`（任意）を渡し、`handle_new_user` トリガーで `profiles`/`user_settings` を自動生成させる
4. ログイン・ログアウト
5. `proxy.ts`（Next.js 16のmiddleware改名）で未認証アクセスの制御
6. Supabaseの型定義生成（`generate_typescript_types` ツールが使える）

# Software Requirements Specification（SRS）

**文書バージョン：** 1.0
**最終更新日：** 2026-05-17
**ステータス：** Draft

## 改訂履歴

| バージョン | 日付       | 変更内容                 | 変更者 |
| ---------- | ---------- | ------------------------ | ------ |
| 1.0        | 2026-05-17 | 初版作成                 | 私     |
| 1.1        | 2026-6-8   | データモデル確定（変更） | 私     |

---

## 1. Introduction

### 1.1 Purpose

本書は軽量で無料のチャットアプリの要件を定義する。

### 1.2 Scope

- プライバシー保護を重視しつつ、ユーザー同士およびグループでテキストおよび画像を送受信できる軽量・高速なチャットアプリを提供する。
- 低スペック端末（学校PC含む）での動作を前提とし、広告は表示しない。ブラウザから利用可能とし、PWAとしてインストールにも対応する。
- アカウント登録は必須とし、ユーザーID・表示名・パスワード・アイコンで構成する。メール登録は任意とする。
- 通常チャットは履歴保持を基本とする。
- 一時チャットは有効期限付きチャットとし、期限到達または条件成立時に削除される。
- 追加認証（認証PIN／認証キー）を任意で設定でき、アプリ起動時・各チャット・非表示メッセージ一覧に割り当て可能とする。
- 動画・音声・その他ファイル送信、デスクトップアプリ化、UI切り替え機能は現時点では対象外（将来検討）。

### 1.3 Definitions, Acronyms

| 用語 / 略語    | 説明                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| SRS            | Software Requirements Specification。本書のこと。                          |
| PWA            | Progressive Web App。ブラウザからインストール可能なWebアプリ形式。         |
| RLS            | Row Level Security。Supabaseが提供する行レベルのアクセス制御機能。         |
| E2EE           | End-to-End Encryption。エンドツーエンド暗号化。現時点では未対応。          |
| Room           | チャットの単位。1対1・グループどちらも Room として扱う。                   |
| 通常チャット   | 明示的な削除操作を行わない限り履歴を保持するチャット。                     |
| 一時チャット   | 有効期限または条件付きで自動削除されるチャット。                           |
| フレンド       | フレンド申請を送り、相手が承認することで成立するユーザー間の関係。         |
| ストレンジャー | フレンド関係にないが、過去に1度以上メッセージのやりとりがあるユーザー。    |
| 認証PIN        | アプリ内独自の4〜8桁の暗証番号。追加認証に使用する。                       |
| 認証キー       | 追加認証に使用するパスワード。アカウントのパスワードとは別物。             |
| 論理削除       | データを物理的に削除せず、削除日時カラムで削除状態を管理する方式。         |
| 非表示         | メッセージを自分のみ見えない状態にする機能。データは保持される。           |
| Supabase       | PostgreSQLベースのBaaS（Backend as a Service）。認証・DB・Realtimeを提供。 |
| Cloudinary     | 画像・メディアのクラウドストレージおよび変換サービス。                     |
| Vercel         | Next.jsアプリのホスティングおよびデプロイプラットフォーム。                |
| App Router     | Next.js 13以降の標準ルーティング方式。`app/` ディレクトリベース。          |

### 1.4 References

| 分類           | 名称 / URL                                                          |
| -------------- | ------------------------------------------------------------------- |
| フロントエンド | [Next.js 公式ドキュメント](https://nextjs.org/docs)                 |
| 言語           | [TypeScript 公式ドキュメント](https://www.typescriptlang.org/docs/) |
| スタイリング   | [Tailwind CSS v4 公式ドキュメント](https://tailwindcss.com/docs)    |
| BaaS           | [Supabase 公式ドキュメント](https://supabase.com/docs)              |
| 認証           | [Supabase Auth](https://supabase.com/docs/guides/auth)              |
| リアルタイム   | [Supabase Realtime](https://supabase.com/docs/guides/realtime)      |
| ストレージ     | [Cloudinary 公式ドキュメント](https://cloudinary.com/documentation) |
| デプロイ       | [Vercel 公式ドキュメント](https://vercel.com/docs)                  |
| パッケージ管理 | [npm 公式ドキュメント](https://docs.npmjs.com/)                     |
| バージョン管理 | Git / [GitHub](https://github.com/)                                 |

---

## 2. Overall Description

### 2.1 Product Perspective

本アプリは低スペック端末や学校PCでも動作する軽量Webチャットアプリであり、既存の高機能チャットアプリの代替として利用されることを想定する。ブラウザからアクセス可能とし、PWAとしてインストールにも対応する。外部サービスとの連携は行わない独立したアプリケーションとする。

### 2.2 Product Functions

- ユーザー登録およびログイン
- フレンド申請・承認・拒否
- フレンド／ストレンジャー一覧表示（直近会話順）
- ユーザーIDによるフレンド申請・DM開始
- ユーザー間およびグループでのテキスト送受信
- 画像の送受信（上限5MB・JPEG/PNG/WebP/GIF）
- チャット（ルーム）の作成・参加
- 履歴保持型チャット
- 一時チャット（10分／1時間／24時間／7日間／カスタム最大90日）
- メッセージ削除（自分の送信メッセージのみ・論理削除・双方から非表示）
- メッセージ非表示（任意メッセージを自分のみ非表示）
- 非表示メッセージ一覧の確認・復元（追加認証を経て実行）
- 追加認証機能（認証PIN 4〜8桁 または 認証キー）
- 認証の割り当て設定（アプリ起動時・各チャット・非表示一覧）
- 知らない人からのDM受信設定
- ブロック機能
- プッシュ通知オン/オフ（一括切り替え）
- リアルタイムメッセージ更新
- 低スペック端末向け軽量表示

### 2.3 User Classes

- 一般ユーザー
- 低スペック端末ユーザー
- 軽量志向ユーザー
- プライバシー重視ユーザー
- 制限環境ユーザー

### 2.4 Operating Environment

- Webブラウザ（Chrome, Edge 等）
- PC / スマートフォン対応
- 低スペック端末対応
- インターネット接続必須
- PWAインストール対応

### 2.5 Constraints

- プライバシー保護最優先
- 低スペック端末での動作保証
- ブラウザのみで利用可能
- 軽量・高速設計
- 広告なし
- 外部サービス連携なし
- フロントエンド：Next.js（TypeScript・App Router）
- バックエンド：Supabase / Cloudinary
- デプロイ：Vercel
- 無料プランでの運用を前提とする

### 2.6 Assumptions

- インターネット接続が可能
- 基本的なブラウザ操作が可能
- アカウント情報を自己管理できる
- 極端な制限環境は対象外

### 2.7 Dependencies and Risks

| 依存先         | リスク                                     | 対応方針                                                            |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Supabase       | 障害時にDB・Realtime・認証が全停止する     | エラー画面を表示し、復旧を待つ。ポーリングでフォールバック          |
| Cloudinary     | 障害時に画像アップロード・表示が不可になる | アップロード失敗時はユーザーにリトライを促すエラーメッセージを表示  |
| Vercel         | デプロイ・Edge Function障害                | 静的ページは引き続き表示される設計とし、API障害は適切にハンドリング |
| 無料プラン制限 | Realtimeイベント数・ストレージ上限への到達 | モニタリングを行い、上限接近時に機能制限または課金移行を検討        |

---

## 3. Specific Requirements

### 3.1 Functional Requirements

| ID    | 要件                                                                                                                    | 優先度 |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-1  | アカウント作成（ユーザーID 英数字3〜20文字・表示名1〜30文字・パスワード・アイコン任意・メール任意・認証設定スキップ可） | 必須   |
| FR-2  | ログイン（ユーザーID／メールアドレス＋パスワード）                                                                      | 必須   |
| FR-3  | 1対1チャット（DM）作成                                                                                                  | 必須   |
| FR-4  | グループチャット作成（人数上限なし）                                                                                    | 必須   |
| FR-5  | テキスト送信                                                                                                            | 必須   |
| FR-6  | メッセージ受信（リアルタイム）                                                                                          | 必須   |
| FR-7  | 画像送信（Cloudinary経由・上限5MB・JPEG/PNG/WebP/GIF）                                                                  | 必須   |
| FR-8  | 画像閲覧                                                                                                                | 必須   |
| FR-9  | 履歴保持チャット                                                                                                        | 必須   |
| FR-10 | 一時チャット（10分／1時間／24時間／7日間／カスタム最大90日・自動削除）                                                  | 必須   |
| FR-11 | フレンド申請・承認・拒否（承認・拒否の結果を申請者に通知。無視は通知なし、バッジのみ既読扱い）                          | 必須   |
| FR-12 | フレンド一覧表示（直近会話順）                                                                                          | 必須   |
| FR-13 | ストレンジャー一覧表示（直近会話順）                                                                                    | 必須   |
| FR-14 | チャット内検索（会話履歴があるユーザーが対象。オプションで同グループメンバーも追加可）                                  | 必須   |
| FR-15 | ユーザー追加機能（ユーザーIDからフレンド申請またはDM開始。PCはサイドバー・スマホはボトムバーに配置）                    | 必須   |
| FR-16 | メッセージ削除（自分の送信メッセージのみ・論理削除・送信者・受信者どちらからも非表示）                                  | 必須   |
| FR-17 | メッセージ非表示（任意のメッセージを自分の画面のみ非表示。他者には影響なし）                                            | 必須   |
| FR-18 | 非表示メッセージ一覧（チャットオプションから追加認証を経て確認・復元可能）                                              | 必須   |
| FR-19 | 追加認証設定（認証PIN 4〜8桁 または 認証キー。アカウント作成時に設定可・スキップ可。後から変更可）                      | 必須   |
| FR-20 | 認証割り当て設定（アプリ設定または各チャットオプションから、起動時・各チャット・非表示一覧への認証割り当てを設定可）    | 必須   |
| FR-21 | リアルタイムメッセージ更新（Supabase Realtime）                                                                         | 必須   |
| FR-22 | 知らない人からのDM受信設定（オン/オフ）                                                                                 | 必須   |
| FR-23 | ブロック機能                                                                                                            | 必須   |
| FR-24 | プッシュ通知オン/オフ（一括切り替え。配置は実装時に決定）                                                               | 必須   |

---

### 3.2 External Interface Requirements

#### 3.2.1 UI

- アプリ紹介ページ
- ホーム画面
- ログイン／アカウント作成画面（認証設定を含む）
- チャット一覧画面（フレンド・ストレンジャー・グループ・検索の4タブ）
- チャット画面
- 画像送信UI
- チャット設定・オプション画面（認証割り当て・非表示メッセージ一覧を含む）
- アプリ設定画面（認証設定・通知設定・DM受信設定を含む）
- ユーザー追加UI（PCはサイドバー・スマホはボトムバー）
- プッシュ通知トグル（配置は実装時に決定）
- エラー画面・オフライン通知UI

#### 3.2.2 API

| エンドポイント種別  | 概要                                               | 実装方式                               |
| ------------------- | -------------------------------------------------- | -------------------------------------- |
| 認証API             | ログイン・ユーザー登録                             | Supabase Auth                          |
| メッセージ送受信API | 送信・取得（ページング 20〜50件）・論理削除        | Supabase DB + Next.js Route Handler    |
| メッセージ非表示API | 非表示登録・解除・一覧取得                         | Supabase DB + Next.js Route Handler    |
| チャット管理API     | ルーム作成・参加・設定・一時チャット管理           | Supabase DB + Next.js Route Handler    |
| 画像アップロードAPI | Cloudinaryへのアップロード（クライアント側圧縮後） | Next.js Route Handler → Cloudinary API |
| フレンド管理API     | 申請・承認・拒否・一覧取得                         | Supabase DB + Next.js Route Handler    |
| ユーザー追加API     | ユーザーIDによる検索・申請・DM開始                 | Supabase DB + Next.js Route Handler    |
| ブロック管理API     | ブロック登録・解除・一覧取得                       | Supabase DB + Next.js Route Handler    |
| 追加認証API         | 認証PIN／認証キーの設定・検証                      | Next.js Route Handler                  |
| 通知設定API         | プッシュ通知・DM受信設定の取得・更新               | Supabase DB + Next.js Route Handler    |

#### 3.2.3 エラーレスポンス規約

APIのエラーレスポンスは以下の形式に統一する。

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "ユーザー向けメッセージ（日本語）"
  }
}
```

主要なエラーコード：

| コード                | HTTPステータス | 説明                                    |
| --------------------- | -------------- | --------------------------------------- |
| `UNAUTHORIZED`        | 401            | 未認証または追加認証失敗                |
| `FORBIDDEN`           | 403            | アクセス権限なし（RLS違反含む）         |
| `NOT_FOUND`           | 404            | 対象リソースが存在しない                |
| `VALIDATION_ERROR`    | 422            | 入力値バリデーション失敗                |
| `RATE_LIMITED`        | 429            | レート制限超過                          |
| `INTERNAL_ERROR`      | 500            | サーバー内部エラー                      |
| `SERVICE_UNAVAILABLE` | 503            | 外部サービス（Supabase/Cloudinary）障害 |

---

### 3.3 Non-Functional Requirements

#### Performance

- 軽量設計はデータ削減ではなく取得・描画の最適化で実現する
- 初期表示は最小データのみ取得する
- メッセージはページング（20〜50件）または無限スクロールで取得する
- 全履歴の初期ロードは行わない
- 遅延読み込みを徹底する
- **定量目標：**
  - チャット一覧画面の初期表示：3秒以内（低スペック端末・3G回線想定）
  - メッセージ送信からUI反映まで：1秒以内（通常回線）
  - Realtime受信遅延：2秒以内（通常時）
  - 画像アップロード完了通知：10秒以内（5MB上限ファイル・通常回線）

#### Scalability

- 小規模〜中規模ユーザーを想定
- 将来的なスケールアップを考慮した設計

#### Security

- パスワードのハッシュ化（Supabase Auth に委譲）
- 追加認証（認証PIN／認証キー）のハッシュ化保存（bcrypt等）
- Row Level Security（RLS）によるアクセス制御
- ユーザーは所属ルームのデータのみアクセス可能
- ブロックユーザーからのアクセスをRLSで制御
- Cloudinary署名付きアップロードによる不正アップロード防止
- HTTPS通信
- **認証PIN／認証キーの連続失敗制限：** 5回連続失敗でロック（ロック解除方法は実装時に決定）
- **セッション管理：** Supabase AuthのJWTセッションを使用。有効期限はSupabaseデフォルト設定に準ずる

#### Availability

- 高可用性を目指す
- 障害時のデータ保全
- **外部サービス障害時の挙動：**
  - Supabase障害：メッセージ送受信・認証が不可になる。画面にエラーを表示し、操作をブロックする
  - Cloudinary障害：画像送信が不可になる。テキスト送信は継続可能。エラーメッセージを表示する
  - Vercel障害：アプリ自体にアクセス不可になる

#### Usability

- シンプルUI
- 直感的操作性
- プッシュ通知はベストエフォート（学校PCなど制限環境では届かない場合がある）
- **アクセシビリティ：** キーボード操作対応、適切なコントラスト比（WCAG 2.1 AA準拠を目標）

---

### 3.4 Error Handling Requirements

#### クライアントサイド

- ネットワーク切断時はオフラインバナーを表示し、再接続を検知したら自動的にバナーを非表示にする
- メッセージ送信失敗時はリトライボタンを表示する（最大3回まで自動リトライ後、手動リトライに切り替え）
- 画像アップロード失敗時は失敗メッセージを表示し、再送信を促す
- フォームバリデーションエラーは該当フィールド直下に日本語でインラインで表示する
- 予期しないエラー発生時は汎用エラー画面（「エラーが発生しました。再度お試しください」）を表示する

#### サーバーサイド

- Supabaseクエリ失敗時はエラーをログに記録し、クライアントに `INTERNAL_ERROR` を返す
- Cloudinary APIが失敗した場合、リトライは行わずエラーレスポンスをクライアントに返す
- RLS違反は `FORBIDDEN` として返し、詳細なDB情報はクライアントに露出しない
- 一時チャットの自動削除処理（Edge Functions / pg_cron）が失敗した場合、次回実行時に再処理する

---

### 3.5 Data Requirements

#### データモデル

```
User
├── id                         : UUID（Supabase Auth の user id と一致）
├── username                   : TEXT UNIQUE NOT NULL（英数字のみ・3〜20文字）
├── display_name               : TEXT NOT NULL（1〜30文字）
├── avatar_url                 : TEXT（Cloudinary画像URL）
├── email                      : TEXT UNIQUE（任意）
├── auth_type                  : TEXT（'pin' | 'key' | null）
├── auth_secret                : TEXT（ハッシュ済み認証PIN／認証キー）
├── dm_from_stranger_enabled   : BOOLEAN NOT NULL DEFAULT true
├── push_notifications_enabled : BOOLEAN NOT NULL DEFAULT true
└── created_at                 : TIMESTAMPTZ NOT NULL DEFAULT now()

Room
├── id           : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── name         : TEXT（グループ名。1対1はNULL可）
├── is_group     : BOOLEAN NOT NULL DEFAULT false
├── is_temporary : BOOLEAN NOT NULL DEFAULT false
├── expires_at   : TIMESTAMPTZ（一時チャットの有効期限。NULLなら期限なし。最大90日）
├── lock_type    : TEXT NOT NULL DEFAULT 'none'（'none' | 'pin' | 'key'。※未使用。下記注記参照）
├── lock_secret  : TEXT（ハッシュ済み認証PIN／認証キー。※未使用。下記注記参照）
└── created_at   : TIMESTAMPTZ NOT NULL DEFAULT now()

※ lock_type/lock_secretについて（Phase 6で判明）：
「各チャットに鍵をかける」機能は、実装時にこの部屋単位の共有シークレットではなく、
RoomMember.auth_required（自分の行のみのトグル）＋ User.auth_type/auth_secret
（アカウントにつき1つの秘密）の組み合わせで実現した。理由は、①現行RLSではDM作成者
（owner）以外が自分の意思で部屋の行を更新できない、②5回失敗ロックの追跡列が部屋側に
無い、という実装上の制約に加え、実際の脅威モデルが「端末を他人に貸したときの覗き見防止
（アカウントにつき1つのPIN/キーで、見たいチャットにだけ自分のアカウントからのみ鍵をかける。
相手には影響しない）」という個人・端末単位の防御だったため。lock_type/lock_secret列は
将来のグループ単位の共有ロック等の用途を見込んで削除はせず残しているが、現在の実装では
参照されていない。

RoomMember
├── id            : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── room_id       : UUID NOT NULL REFERENCES Room(id) ON DELETE CASCADE
├── user_id       : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── role          : TEXT NOT NULL DEFAULT 'member'（'owner' | 'member'）
├── auth_required : BOOLEAN NOT NULL DEFAULT false（Phase 6追加。上記の「各チャット」鍵トグル。自分の行のみ）
├── joined_at     : TIMESTAMPTZ NOT NULL DEFAULT now()
└── UNIQUE(room_id, user_id)

Message
├── id         : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── room_id    : UUID NOT NULL REFERENCES Room(id) ON DELETE CASCADE
├── sender_id  : UUID REFERENCES User(id) ON DELETE SET NULL
├── content    : TEXT（テキスト本文。画像のみ送信時はNULL可）
├── image_url  : TEXT（Cloudinary画像URL。テキストのみ時はNULL）
├── deleted_at : TIMESTAMPTZ（論理削除日時。NULLなら未削除）
└── created_at : TIMESTAMPTZ NOT NULL DEFAULT now()

MessageHidden
├── id         : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── message_id : UUID NOT NULL REFERENCES Message(id) ON DELETE CASCADE
├── user_id    : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── hidden_at  : TIMESTAMPTZ NOT NULL DEFAULT now()
└── UNIQUE(message_id, user_id)

Friendship
├── id           : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── requester_id : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── addressee_id : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── status       : TEXT NOT NULL DEFAULT 'pending'（'pending' | 'accepted' | 'rejected'）
├── is_read      : BOOLEAN NOT NULL DEFAULT false（申請を受け取った側が確認済みか）
├── created_at   : TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at   : TIMESTAMPTZ NOT NULL DEFAULT now()
└── UNIQUE(requester_id, addressee_id)

Block
├── id         : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── blocker_id : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── blocked_id : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── created_at : TIMESTAMPTZ NOT NULL DEFAULT now()
└── UNIQUE(blocker_id, blocked_id)

TempChatSession（一時チャット・両者が閉じた場合の削除オプション用）
├── id        : UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── room_id   : UUID NOT NULL REFERENCES Room(id) ON DELETE CASCADE
├── user_id   : UUID NOT NULL REFERENCES User(id) ON DELETE CASCADE
├── closed_at : TIMESTAMPTZ
└── UNIQUE(room_id, user_id)
```

#### Message

- テキストと画像URLを同一レコードで管理する
- テキストのみ・画像のみ・テキスト＋画像の3パターンを許容する
- 削除はRLSで送信者のみに制限し、`deleted_at` を設定することで論理削除とする
- `deleted_at IS NOT NULL` のメッセージはRLSで送信者・受信者どちらにも返さない
- ページング取得を前提とし、`created_at` にインデックスを付与する

#### Friendship

- `is_read = false` の申請件数をバッジ表示に使用する
- ユーザー追加機能を開いたタイミングで `is_read = true` に更新する

#### 検索対象の定義

- フレンドおよびストレンジャー（Friendshipレコードが存在する、またはRoomMemberとして同一Roomに所属し会話履歴がある相手）を検索対象とする
- メッセージをすべて削除・非表示にしてもRoomレコードは保持されるため、「一度でもやりとりした」状態は維持される
- オプション（チェックボックス）で、会話履歴がない同グループメンバーも検索対象に追加できる

#### 画像データ

- 実体はCloudinaryに保存し、DBにはURLのみ保持する
- クライアント側で圧縮・リサイズを実施してからアップロードする
- 上限：5MB／対応フォーマット：JPEG・PNG・WebP・GIF

#### データ設計方針

- 大量データでもパフォーマンスを維持する
- 将来的にアーカイブ戦略の導入が可能な構造とする

#### データ保持・削除ポリシー

- 通常チャットのメッセージは明示的な削除操作（論理削除）を行わない限り無期限に保持する
- 論理削除されたメッセージのレコードはDBに残るが、全ユーザーの画面から非表示となる（物理削除は将来検討）
- 一時チャットのメッセージ・ルームは有効期限到達後または両者クローズ後に物理削除する
- アカウント削除時の挙動：`sender_id` を NULL に設定（ON DELETE SET NULL）し、メッセージ本文は保持する（将来のポリシー変更を考慮）
- Cloudinaryに保存した画像は、対応するMessageレコードの論理削除・物理削除とは独立して保持される（Cloudinaryの容量管理は別途運用で対応）

---

### 3.6 Realtime Requirements

- Supabase Realtimeを使用する
- 必要に応じてポーリングでフォールバックする
- チャット画面表示時のみ購読を開始する
- 画面離脱時に購読を解除する
- 必要なルームのみ購読する
- 同時接続数・イベント数の最適化を行う

---

### 3.7 Temporary Chat Requirements

- 一時チャットは有効期限を持つ
- 期限の選択肢：10分間・1時間・24時間・7日間・カスタム入力（分／時間／日単位・最大90日）
- 削除条件：
  - 指定時間経過（`expires_at` を超えた場合）
  - 両者がチャットを閉じた場合（`TempChatSession.closed_at` が全メンバー分揃った場合・オプション）
- 削除処理はSupabase Edge Functions または pg_cron で定期実行する
- 削除処理の実行間隔は最大10分とし、期限超過から最大10分以内に削除が完了することを保証する
- 削除処理失敗時は次回実行で再試行する。連続失敗はログに記録する

---

### 3.8 Authentication Requirements

- 追加認証は認証PINまたは認証キーのいずれか一方のみ設定可能
- 認証PIN：4〜8桁の数字
- 認証キー：任意文字列（アカウントパスワードとは別物）
- アカウント作成時に設定可能（スキップ可。後から設定・変更も可能）
- アカウント作成時または初回設定時に、認証が使える場所（アプリ起動時・各チャット・非表示一覧）を案内する
- 割り当て先はアプリ設定または各チャットオプションから変更可能
- 認証が未設定の場合、非表示一覧には認証なしでアクセスできる
- **追加認証の失敗制限：** 5回連続失敗でロックし、ロック解除方法（アカウントパスワードによる再設定等）は実装時に決定する

---

### 3.9 Testing Requirements

本SRSに基づく実装が要件を満たしているかを検証するために、以下のテストを実施する。

#### 単体テスト（Unit Test）

- 各Route Handlerのレスポンス形式・ステータスコードの検証
- バリデーションロジック（ユーザーID形式・メッセージ長・画像サイズ等）
- 認証PIN／認証キーのハッシュ化・照合ロジック

#### 結合テスト（Integration Test）

- Supabase DB操作（CRUD・RLS）の動作確認
- Cloudinaryアップロードフローの動作確認
- Realtime購読のイベント受信確認

#### E2Eテスト（End-to-End Test）

- アカウント作成〜ログイン〜メッセージ送受信の基本フロー
- フレンド申請〜承認〜DM開始フロー
- 一時チャットの作成〜有効期限到達〜自動削除の確認
- 追加認証の設定〜割り当て〜認証画面表示の確認
- ブロック機能の動作確認

#### 非機能テスト

- パフォーマンス：低スペック端末（RAM 2GB・低速CPU）でのチャット一覧表示が3秒以内であることを確認
- セキュリティ：RLS設定により他ユーザーのメッセージが取得できないことを確認

---

## 4. Constraints

- プライバシー優先設計
- 低スペック端末対応
- 広告なし
- 外部連携なし
- シンプル構成維持
- Next.js（TypeScript）+ App Router 使用
- Supabase（Auth / PostgreSQL / Realtime）利用
- Cloudinary（画像ストレージ）利用
- Vercelデプロイ
- 通常チャットの自動削除は行わない
- 初期状態でのE2EEは未対応

---

## 5. Future Extensions

- ファイル送信機能
- 音声通話・リアルタイム画面共有機能
- UIテーマ切り替え
- デスクトップアプリ化
- 高度なセキュリティ機能（E2EE含む）
- メッセージ既読管理
- スパム自動判定・自動ブロック（ルールベースから検討）
- ユーザーブロック・通報機能の拡充
- プッシュ通知トグルの配置確定（実装時に決定）
- 知らない人からのDMに対するより細かい受信設定
- アカウント削除機能（削除時のデータ処理ポリシーを含む）
- 物理削除バッチ（論理削除済みメッセージの定期クリーンアップ）
- Cloudinary画像の孤立ファイル削除バッチ
- メッセージのMarkDown表示対応

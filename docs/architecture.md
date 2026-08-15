# アーキテクチャ・ファイル構成（現状スナップショット）

現在のディレクトリ構成と、各ディレクトリ・重要ファイルの役割のみを示す。**「いつ・どのPhaseで追加/変更されたか」は書かない**（`git log -- <path>`または`docs/phases/`で追える）。ここは常に「今の姿」だけを保つこと。

```
tiliq-chat/
├── app/
│   ├── layout.tsx              # フォント・メタデータ・PWA設定・Service Worker登録・オフラインバナー・インストール導線
│   ├── page.tsx                 # アプリ紹介ページ（ログイン/サインアップ導線）
│   ├── error.tsx                # 汎用エラー画面
│   ├── global-error.tsx         # ルートレイアウトクラッシュ時の最終防衛ライン
│   ├── not-found.tsx            # ブランド準拠の404画面
│   ├── globals.css              # デザイントークン・Tailwind v4設定
│   ├── favicon.ico
│   ├── api/
│   │   └── cloudinary/sign/route.ts   # Cloudinary署名発行
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── settings/page.tsx        # 追加認証・通知・DM受信設定画面（永続サイドバーシェルには含まれない独立ページ）
│   ├── (shell)/                 # 永続サイドバーシェル（Route Group。URLには現れない）
│   │   ├── layout.tsx           # サイドバー（SidebarNav）のデータ取得・起動時ゲート判定。`/home`⇔`/chat/[roomId]`間のクライアント遷移で再マウントされない
│   │   ├── home/page.tsx        # チャット未選択時のメインエリアのプレースホルダ
│   │   └── chat/[roomId]/
│   │       ├── page.tsx         # チャット画面（DM/グループ分岐、各種ゲート判定、DB取得のPromise.all並列化）
│   │       └── template.tsx     # roomId切り替え時の強制リマウント用（AuthGateのsessionStorage再チェックを担保）
│   ├── chat/[roomId]/hidden/page.tsx  # 非表示メッセージ一覧（永続サイドバーシェルには含めない独立ページ）
│   └── actions/
│       ├── auth.ts              # signup/login/logout
│       ├── auth-secret.ts       # 追加認証（PIN/キー）設定・検証系
│       ├── rooms.ts             # DM開始・グループ作成/メンバー管理/オーナー譲渡・一時チャット・鍵トグル
│       ├── friends.ts           # フレンド申請系
│       ├── blocks.ts            # ブロック系
│       ├── messages.ts          # deleteMessage/hideMessage/unhideMessage
│       └── settings.ts          # 各種user_settings更新
├── lib/
│   ├── supabase/{client,server,admin}.ts
│   ├── cloudinary/{sign,upload,url}.ts
│   ├── images/compress.ts       # 送信前バリデーション・リサイズ
│   ├── errors.ts                # Server Action呼び出し失敗時の共通エラーメッセージ
│   └── hooks/useRowContextMenu.ts # 一覧行の右クリック/長押しその場メニュー用フック
├── components/
│   ├── TiliquaMark.tsx
│   ├── auth/AuthGate.tsx        # 追加認証の共通ゲート（起動時／各チャット／非表示一覧の3スコープで共用）
│   ├── settings/{AuthSettingsForm,NotificationSettingsForm}.tsx
│   ├── pwa/{ServiceWorkerRegistrar,OfflineBanner,InstallPrompt}.tsx
│   ├── ui/Modal.tsx              # 汎用モーダルラッパー（CreateGroupPanel・CreateTempChatPanelが使用。GroupMembersPanelは未追従）
│   ├── shell/                    # 永続サイドバーシェル本体
│   │   ├── ShellRow.tsx          # サイドバー/メインのmd:分割（useSelectedLayoutSegmentでモバイル幅の表示切替）
│   │   ├── GatedShellBody.tsx    # 起動時ゲート有効時のクライアント側取得＋描画
│   │   └── ShellFriendshipsSync.tsx  # 非ゲート時のfriendships Realtime購読
│   ├── chat/
│   │   ├── ChatRoom.tsx              # チャット画面本体・Realtime購読・画像添付・ブロックUI・削除/非表示・オプションメニュー・DM/グループ分岐
│   │   ├── MessageBubble.tsx         # メッセージ表示・長押し/右クリック/キーボードでの削除・非表示メニュー
│   │   ├── ChatRoomOptionsMenu.tsx   # チャットオプションメニュー（鍵トグル・非表示一覧・メンバー一覧・一時チャットを作成/閉じる）
│   │   ├── GroupMembersPanel.tsx     # グループメンバー一覧・追加・削除・退出・オーナー譲渡・グループ削除のモーダル
│   │   ├── GatedChatRoomLoader.tsx   # 各チャットゲート有効時のクライアント側取得
│   │   └── HiddenMessagesList.tsx    # 非表示メッセージ一覧本体
│   └── home/
│       ├── SidebarNav.tsx        # サイドバー全体の合成コンポーネント。「検索」「一覧」タブの排他切替＋「＋」新規作成メニュー（グループ/一時チャット）＋選択中ビュー
│       ├── HomeTabs.tsx          # 「一覧」タブ本体：すべて/フレンド/ストレンジャー/一時チャット/グループのサブフィルタ・DM行の右クリック/長押しメニュー
│       ├── AddUserPanel.tsx      # 「検索」タブ本体：ユーザー検索・フレンド申請・簡易ブロック・検索結果行の右クリック/長押しメニュー
│       ├── CreateGroupPanel.tsx  # グループ作成モーダル
│       ├── CreateTempChatPanel.tsx # 一時チャット作成モーダル（相手を検索から選ぶ・有効期限選択）
│       ├── CreateTempChatWithUserModal.tsx # 相手が確定済みの状態で一時チャットを作成するモーダル（チャット画面オプションメニュー・右クリック/長押しメニューの両方から使う）
│       ├── TempChatDurationField.tsx # 一時チャットの有効期限選択UI（CreateTempChatPanel/CreateTempChatWithUserModal共用）
│       └── HomeHeader.tsx        # ホーム画面ヘッダー（ロゴ・ユーザー名・設定/ログアウト導線。ゲート解錠後にのみ描画）
├── types/supabase.ts             # Supabase生成型定義
├── public/
│   ├── manifest.webmanifest
│   ├── icon-*.png
│   └── sw.js                     # 最小構成Service Worker
├── docs/
│   ├── srs.md                    # 要件定義（正）
│   ├── schema.sql                # DBスキーマ参照用ファイル（実マイグレーションはSupabase MCP `apply_migration`で管理）
│   ├── architecture.md           # このファイル
│   ├── backlog.md                # 次にやること・検討中のアイデア
│   ├── lessons.md                # 横断的な技術知見
│   └── phases/                   # Phaseごとの実装詳細アーカイブ（phase-01-*.md 〜）
├── proxy.ts                      # ルート保護・セッションリフレッシュ（Route Group導入後もpathnameベースのmatcherは無変更で機能）
├── next.config.ts                # 画像remotePatterns + sw.js用headers
├── .env.example
└── CLAUDE.md（このファイル群への入口）
```

## 現在の重要な設計パターン（横断的・現状のみ）

- **認証ゲート（`AuthGate`）は3スコープで共用：** 起動時（`launch`）・各チャット（`room:{roomId}`）・非表示一覧（`hidden-list`）。sessionStorageベースでタブセッション単位に解錠状態を管理する（DB側にセッション状態は持たない）
- **ゲート有効時はServer Componentが保護対象コンテンツを事前取得しない。** `GatedShellBody`/`GatedChatRoomLoader`がゲート解錠後にブラウザから直接Supabaseを叩く経路に分岐する
- **ホットパス（メッセージ送受信・ページング）はRoute Handlerを経由せずSupabaseクライアントを直接呼び出す。** Route Handlerは認証・特権操作専用（Cloudinaryの署名発行等）
- **一覧系の複雑な集計はRPC（`get_conversation_list`・`get_group_conversation_list`等）に寄せてN+1を避ける**
- **`ChatPeer`判別共用体（`{kind:"dm",...} | {kind:"group",...}`）でDM/グループ表示を分岐**（`ChatRoom.tsx`起点）
- **一覧行の「右クリック/長押しでその場にメニューを表示」パターンは`lib/hooks/useRowContextMenu.ts`に共通化。** 常時は隠れたケバブボタン（ホバー/フォーカスで表示、キーボード操作対応）と右クリック/長押しを併用する。フックのため配列`.map()`内では直接呼べず、行を独立コンポーネント化する必要がある（`HomeTabs.tsx`の`ConversationRow`・`AddUserPanel.tsx`の`SearchResultRow`）。`MessageBubble.tsx`の削除/非表示メニューは対象がLinkを含まないため独立実装のまま（このフックへは未追従）

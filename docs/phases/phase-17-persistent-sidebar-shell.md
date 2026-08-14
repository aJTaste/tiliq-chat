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


## Phase 28 の実装内容・詳細

`docs/backlog.md`の実機フィードバック由来の小粒課題「一時チャットに名前を付けたい」に対応。Phase 26・27に続き、ユーザーのClaude Pro契約終了当日の残り時間で着手した3件目。

### 概要

一時チャット作成時に任意のチャット名（最大50文字）を指定できるようにした。設定した名前はサイドバーの会話一覧・チャットヘッダーで相手の実表示名より優先して表示され、実表示名は`@username`と並べてサブテキストとして残す（「誰との会話か」の識別性を失わないため）。作成後のリネームは今回のスコープ外（v1）。

### DB変更（適用済み：Supabase MCP `apply_migration "phase28_temp_chat_naming"`）

- `create_temp_dm_room(p_other_user_id uuid, p_expires_at timestamptz)` → `create_temp_dm_room(p_other_user_id uuid, p_expires_at timestamptz, p_name text default null)`。引数の型リストが変わるため`drop function`→`create function`（Phase 6等の既存パターン踏襲）。`p_name`は`create_group_room`と同じ`trim`→空文字なら`null`化→50文字超で`raise exception 'chat name too long'`のバリデーションを行い、`rooms.name`へ保存する
- `get_conversation_list()`の戻り値に`room_name text`を追加（一覧表示用）。戻り値の列構成変更のため同じく`drop`→`create`
- 両関数とも`revoke ... from public/anon` → `grant ... to authenticated`をやり直し済み（`drop`→`create`で新しいOIDになりACLが引き継がれないため。`docs/lessons.md`の既知の教訓通り）
- 新規カラムは追加していない。既存の`rooms.name`（従来グループ名専用）を一時チャットにも流用した

### 変更ファイル

- `app/actions/rooms.ts` — `startTemporaryDirectMessage`に`name?: string`引数を追加。`mapDmError`に`chat name too long`の日本語化を追加
- `components/home/CreateTempChatPanel.tsx` / `components/home/CreateTempChatWithUserModal.tsx` — チャット名（任意）の入力欄を追加
- `components/chat/ChatRoom.tsx` — `ChatPeer`の`dm`バリアントに`roomName: string | null`を追加。DMヘッダーの表示ロジックを変更（後述）
- `app/(shell)/chat/[roomId]/page.tsx` — 既に取得済みだった`room.name`をDM peerオブジェクトへ追加で渡すだけで済んだ（元々`select("id, is_group, is_temporary, name, avatar_url")`でグループ用に取得していたカラムをDM側でも流用）
- `components/chat/GatedChatRoomLoader.tsx` — `loadDm()`にrooms.nameの取得を追加（従来`loadGroup()`だけが`rooms`テーブルを見ており、DM経路には無かったため新規に追加）
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — `get_conversation_list()`の`room_name`列を`ConversationItem`へマッピング（非ゲート経路・起動時ゲート経路の両方で同じ対応が必要だった）
- `components/home/HomeTabs.tsx` — `ConversationItem`（dm）に`roomName`を追加。`ConversationRow`の表示名を`roomName ?? otherDisplayName`に変更。検索フィルタの対象にも`roomName`を追加
- `types/supabase.ts` — マイグレーション適用後に`generate_typescript_types`で再生成
- `docs/schema.sql` — 適用済みマイグレーションを末尾に追記（参照用ファイル）
- `docs/srs.md` — `Room.name`の注記を更新（「グループ名。1対1はNULL可」に一時チャット流用の説明を追加）

### 設計判断・学び

- **アバターの頭文字は`roomName`ではなく常に相手の実表示名（`displayName`）基準のまま据え置いた。** チャット名で上書きすると「これは誰との会話か」が一覧上で視覚的に分からなくなるため。タイトル（主要な表示名）だけを`roomName`優先にし、実表示名は必ずどこかに残す（ヘッダーはサブテキスト、一覧はアバターの頭文字）という設計で、識別性と自由な命名の両立を図った
- **DB変更なしで済むかどうかを先に確認する`docs/lessons.md`の教訓通り、`app/(shell)/chat/[roomId]/page.tsx`は既に`rooms.name`を取得済みだった（グループ用）ため、DM側への配線追加だけで済んだ。** 一方`GatedChatRoomLoader.tsx`の`loadDm()`は元々`rooms`テーブル自体を見ていなかったため、新規に`Promise.all`へ追加する必要があった。「非ゲート経路とゲート経路で同じデータを別々に取得している」設計（`docs/lessons.md`のセキュリティゲート設計の教訓）の場合、片方だけ機能追加して他方を見落とすリスクがあることを再確認した（今回は両方漏れなく対応済み）
- スコープを「作成時のみ設定可能・作成後のリネーム不可」に絞ったのは、今回のセッションがユーザーのClaude Pro契約終了当日という時間制約下だったため。リネーム機能を追加するなら、グループの`updateGroupProfile`（Phase 24）と同様のRLS要否検討（`docs/lessons.md`「オーナー限定の単一カラム更新」の分岐）が必要になるが、一時チャットは`owner`/`member`の役割が固定的な運用に見えて実は`create_temp_dm_room`が呼び出し元を`owner`に固定しているだけなので、同じ理屈がそのまま使えるはず（次回の見積もりの参考として記録）

### 検証方法・実施内容

- DB層：Supabase MCP `execute_sql`で`begin; ... rollback;`によるトランザクション内シミュレーションを実施（`docs/lessons.md`記載の既存パターン）。実ユーザー2名を使い、(1) 前後空白を含む名前が正しくtrimされて保存されること、(2) `get_conversation_list()`が`room_name`を正しく返すこと、(3) 51文字の名前が例外を投げること、(4) 空白のみの名前が`null`に正規化されること、(5) `p_name`省略時も従来通り動作すること、を確認してから本適用
- `get_advisors`（security）で新規の問題が無いことを確認（`authenticated`ロールが`SECURITY DEFINER`関数を実行できるという既存パターンのWARNのみ、他の全RPCと同種で新規ではない）
- `has_function_privilege`で`anon`が新関数を実行できないこと・`authenticated`は実行できることを実測確認
- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件、リポジトリ全体）
- `npm run build`（`next build`、成功）

### 動作確認してほしい項目（2026-08-18 実機確認済み）

- 一時チャット作成時にチャット名を入力すると、作成後のチャットヘッダーに「チャット名」がタイトルとして、その下に「相手の実名 · @username」がサブテキストとして表示されること
- サイドバーの会話一覧（「すべて」「一時チャット」フィルタ双方）で、名前付き一時チャットのアバターは相手の頭文字のまま、表示名だけがチャット名になっていること
- チャット名を付けずに作成した場合は従来通り相手の表示名がそのまま表示されること（後方互換）
- 検索タブ・一覧内検索でチャット名からも一時チャットを見つけられること
- 51文字以上のチャット名を入力した場合、作成がエラーになり日本語メッセージが表示されること

### 未対応・持ち越し事項（Phase 28時点）

- 作成後のチャット名リネーム機能はPhase 28時点では未実装だったが、Phase 30で実装済み
- 上記「動作確認してほしい項目」はPhase 26〜31の実機QA（2026-08-18完了）で確認済み

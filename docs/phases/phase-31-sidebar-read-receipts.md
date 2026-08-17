## Phase 31 の実装内容・詳細

`docs/backlog.md`「実機フィードバックで見つかった小粒課題」の「サイドバーの会話一覧に既読状態を反映したい」に対応。SRS FR-25注記（Phase 29時点で「表示はチャット画面内のみ、サイドバーの会話一覧には未反映」と明記されていたギャップ）を解消した。

このPhaseは、メインアカウントのClaude Pro契約終了（2026-08-17）に伴う「当面最後のClaude Codeセッション」として、Phase 26〜30のコードレベル検証（後述）とあわせて実施した。

### 概要

チャット画面内の既読バッジ（`ChatRoom.tsx`の`readBadge`計算：「自分が送った直近の既読済みメッセージ1件にのみバッジを付ける」方式）と同じロジックを、サイドバー会話一覧（`HomeTabs.tsx`）にも表示する。「未読メッセージがある」ことを知らせる通知的な機能ではなく、あくまで既存の「送った相手が読んだか」の表示範囲を一覧まで広げただけ、という位置づけ。

- DM：自分が送った直近メッセージの右下に小さく「既読」
- グループ：同様に「既読N」（Nは読んだ人数。既読者の名前列挙はPhase 29と同じ理由で行わない）
- グループで`rooms.read_receipts_enabled`がオフの部屋、または既読者0人（まだ誰も読んでいない）の間はバッジ自体を表示しない（ChatRoom.tsxの既存挙動と揃えた）

### DB変更

マイグレーション `phase31_sidebar_read_receipts` を適用済み。列構成変更のため`get_conversation_list`/`get_group_conversation_list`とも`drop function`→`create function`（`docs/lessons.md`の教訓通りanon revokeをやり直し済み）。

- `get_conversation_list`：戻り値に`last_message_read boolean`を追加。`last_msg`CTEに`sender_id`を追加し、相手（`other`CTE）の`last_read_at`と比較して算出
- `get_group_conversation_list`：戻り値に`last_message_read_count integer`を追加。`last_msg`に`sender_id`を追加し、`read_counts`CTEで「直近メッセージの送信者が自分」かつ`rooms.read_receipts_enabled`がtrueの場合のみ既読人数を算出、それ以外はNULL

適用後 `generate_typescript_types` を実行し `types/supabase.ts` を再生成した。

### 変更ファイル

- `docs/schema.sql` — 上記マイグレーションのSQLを追記
- `types/supabase.ts` — 再生成。ついでに元の生成結果を手で書き写した際に紛れ込んでいた`CompositeTypes`ジェネリクスのタイポ（`DefaultSchema["CompositeTypes"][CompositeTypeName]`となっているべきところが誤って`[PublicCompositeTypeNameOrOptions]`のままだった実装ミス）を修正
- `components/home/HomeTabs.tsx` — `ConversationItem`型（dm/group両バリアント）に`lastMessageRead`/`lastMessageReadCount`を追加。`ConversationRow`/`GroupConversationRow`の時刻表示の下に既読バッジを追加
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — RPC結果から`ConversationItem`を組み立てる箇所（起動時ゲート無効時／有効時の2箇所）双方に新フィールドのマッピングを追加
- `docs/architecture.md` — 既読機能の項を更新（「サイドバー一覧には未反映」の記述を解消）

### 設計判断・学び

- **既読0件の間はバッジを出さない、という条件をUI側で明示的に判定する必要があった：** DB側は`read_receipts_enabled=true`かつ直近メッセージが自分の送信であれば`0`を返す設計にした（NULLとは意味が違う：「表示機能はONだが誰もまだ読んでいない」）。しかしUI側は`ChatRoom.tsx`の既存グループロジック（`count > 0`の場合のみバッジ候補にする）に合わせて「0件はバッジ非表示」に倒す必要があり、実装時に一度`lastMessageReadCount !== null`だけで判定してしまい「既読0」という無意味な表示になりかけた（コードレビューで気づいて`&& lastMessageReadCount > 0`を追加）。**DBが返す値の意味（0 vs NULL）とUIの表示条件は必ずしも一致しない**ことを踏まえ、既存の類似ロジック（今回は`ChatRoom.tsx`のreadBadge）との一貫性を明示的に確認すべき、という教訓
- 一覧側はチャット画面と異なりRealtime購読を持たない（Server Component/ゲート解錠時の1回取得のみ）ため、相手が既読を付けた瞬間には反映されず、次回一覧を取得し直すタイミング（画面遷移・`router.refresh()`等）まで反映が遅れる。これは意図的なスコープ限定（既存の一覧取得の仕組みにそのまま乗せる設計とし、一覧専用のRealtime購読を新設するコストは今回は掛けなかった）であり、将来「一覧もリアルタイムに更新したい」という要望が出た場合の既知の制約として残す
- DB層の設計判断（列がRLS判定条件に使われないため新規RPC不要、等）は今回発生しなかった（`get_conversation_list`/`get_group_conversation_list`はもともとSECURITY DEFINERの集計RPCであり、単純な戻り値列追加のみ）

### 検証方法・実施内容

- 適用前に、Supabase MCP `execute_sql`の`begin/rollback`トランザクションで新しい関数定義そのものを試験導入し、以下を確認してから本適用した（`docs/lessons.md`の「DB層のRLS・RPCの動作確認」パターンを踏襲。既存の`test1`〜`test5`ダミーアカウントを使用）：
  - DM：メッセージ送信直後（未読）は`last_message_read=false`、相手が`mark_room_read`を呼んだ後は`true`
  - グループ：3人グループで既読者が0人→1人→2人と増えるにつれ`last_message_read_count`が0→1→2と変化
  - グループオーナーが`read_receipts_enabled`をfalseにすると、既読済みでも`last_message_read_count`がNULLになる
- `npx tsc --noEmit` / `npm run lint` / `npx next build`（いずれもエラー0件）
- `get_advisors`（security/performance）を実行し、本Phaseのマイグレーションに起因する新規の警告が無いことを確認

### Phase 26〜30 のコードレベル検証（本セッションであわせて実施）

Claude Code利用中断前の最後の機会として、Phase 26〜30（実装済みだが実機未検証のまま積み上がっていた5Phase）を、UIを実際に操作せずに検証可能な範囲でチェックした。ユーザー自身の実機確認は依然として必要（詳細は各Phaseファイル・`docs/backlog.md`運用メモ参照）。

- **静的検証：** `npx tsc --noEmit` / `npm run lint` / `npx next build`（本セッション時点で初めて本番ビルドを実行し、成功を確認した）
- **DB層（Phase 28・29が対象）：** `list_migrations`で両マイグレーションの適用を再確認、`get_advisors`で新規警告なしを確認、rollbackトランザクションで以下を検証
  - `create_temp_dm_room`：51文字の名前でエラー、50文字＋前後空白はtrimされて保存、空白のみはNULL化
  - `mark_room_read`：非メンバー拒否・メンバーの正常更新
  - `rooms.read_receipts_enabled`・`rooms.name`：非オーナーの直接UPDATEが0行に留まる（RLSでブロック）こと、オーナーのUPDATEは成功すること
- **Phase 26・27・30（DB非依存）：** 実装コードをチェックリストと突き合わせて再読解。ロジック上の問題は見つからなかった
- 見つかった不具合：**無し**（今回の検証範囲では、Phase 26〜30のいずれにもコードレベル・DBレベルの不具合は発見されなかった）

### 動作確認してほしい項目（2026-08-18 実機確認済み）

Phase 31自体：

- DMで自分が送った直近メッセージが読まれると、サイドバー一覧の該当行にも小さく「既読」と表示されること（画面遷移や再読み込みなど、一覧の再取得タイミングで反映される。チャット画面のような即時反映ではない）
- グループで既読者が増えるにつれ「既読1」「既読2」…と一覧側にも表示されること
- グループオーナーが既読表示をOFFにすると、一覧側の既読バッジも消えること
- 既読者0人の間・新規会話開始直後はバッジが出ないこと

Phase 26〜30（本セッションではコード・DBレベルの検証のみ実施していたが、その後のPhase 26〜31実機QA（2026-08-18完了）でUIの見た目・実機操作感も確認済み）：

- 各Phaseファイル（`docs/phases/phase-26-profile-editing.md`〜`phase-30-temp-chat-rename.md`）の「動作確認してほしい項目」を参照

### 未対応・持ち越し事項（Phase 31時点）

- サイドバー一覧の既読表示はRealtime即時反映ではない（上記「設計判断・学び」参照）。要望が出れば一覧専用のRealtime購読を追加する余地がある
- Phase 26〜30・31の実機での動作確認は、Phase 26〜31実機QA（2026-08-18完了）で全項目済み

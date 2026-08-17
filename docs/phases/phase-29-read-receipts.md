## Phase 29 の実装内容・詳細

`docs/backlog.md`の実機フィードバック由来の課題「既読機能が欲しい」に対応。バックログには「将来のグループチャットでは作成者/管理者が既読機能の有無を設定できるように」という条件付きの要望が付記されていたため、実装前にユーザーへ2点確認した：

1. **DM側のプライバシー：** 自分の既読が相手に常に伝わる仕様（オプトアウト無し）でよいか → 「v1は常にON（オプトアウトなし）」で承認
2. **グループでの既読表示の粒度：** 既読した人の名前列挙 or 件数のみ → 「件数のみ（例：既読3）」で承認

この2点の回答を前提に設計・実装した。

### 概要

- **DM：** 常時ON。自分が送った直近の既読済みメッセージ（相手が読んだと判定できる最新の自分のメッセージ）1件にのみ「既読」バッジを表示する（LINE等と同様、既読済み全件に付けると冗長になるため）
- **グループ：** オーナーが「メンバー一覧」パネルのグループ設定から既読表示のON/OFFを切り替え可能（デフォルトON）。ONの場合、自分が送った直近の既読済みメッセージに「既読N」（N=自分以外で読んだ人数）バッジを表示する。誰が読んだかの名前列挙はしない
- 表示はチャット画面内のみ。サイドバーの会話一覧（`get_conversation_list`/`get_group_conversation_list`）には未反映（今回のスコープ外）
- 作成後の設定変更同様、既読状態は「自分が最後にこのルームを開いた時刻（`last_read_at`）」ベースの近似であり、メッセージ単位の既読/未読を個別追跡するものではない（Discord/Slack等と同じ「閲覧位置」方式。1行のみの更新で済むため大規模グループでも安価）

### DB変更（適用済み：Supabase MCP `apply_migration "phase29_read_receipts"`）

- `room_members.last_read_at timestamptz`（自分の閲覧位置。NULLなら未読）を追加
- `rooms.read_receipts_enabled boolean not null default true`（グループのみ意味を持つオーナー切替トグル）を追加
- `mark_room_read(p_room_id uuid) returns void` RPC（SECURITY DEFINER）を新設。呼び出し者自身の`room_members.last_read_at`を`now()`に更新する
  - **`room_members_update_owner`ポリシー（オーナー限定）は非オーナーが自分の行を更新することも許さないため、素のテーブルUPDATEでは実現できず専用RPCが必須**（`set_room_auth_required`・Phase 6と同じ理由。`docs/lessons.md`の既存の分岐通り）
  - 事前にrollback付きトランザクションで検証。当初「非オーナーの直接UPDATEは例外を投げてブロックされる」という誤った前提でテストを書いたが、実際はRLSのUSING句に一致しない行が黙って0行UPDATEになるだけで例外にはならないことが判明し、アサーション方法を「例外の有無」から「更新後の値」に修正して再検証した（詳細は下記「設計判断・学び」）
  - 同じ検証中、テスト用に`get_or_create_dm_room`で新規DMを作ろうとしたところ、テスト対象の2ユーザー間に**既存の本番DMが複数存在し、ルームによってowner/memberの割り当てが異なる**ことが判明。既存ルームを流用したテストは対象ロールを誤認するリスクがあるため、以降は明示的なroleでテスト専用ルームを直接INSERTする方式に切り替えた
- `read_receipts_enabled`は`rooms.name`/`avatar_url`（Phase 24）と同じ理由（RLS判定条件に使われない単純な列）で、既存の`rooms_update_owner`ポリシーが素のUPDATEをそのままカバーする。新規RPC不要
- `room_members`テーブルをRealtime対象に追加（`alter publication supabase_realtime add table public.room_members;`）。相手の既読更新をリアルタイムに反映するため
- 両関数とも`get_advisors`・`has_function_privilege`で新規の問題が無いことを確認済み（既存パターンと同種のWARNのみ）

### 変更ファイル

- `components/chat/ChatRoom.tsx` — `ChatPeer`型に`lastReadAt`（dm）・`readReceiptsEnabled`/`members[].lastReadAt`（group）を追加。既読状態は`peer`とは別に`readStateByUserId`（`Map<userId, lastReadAt>`）という専用stateで一元管理し、`room_members`のRealtime UPDATE購読（既存のメッセージ購読チャンネルに相乗り）で更新する。マウント時・新着メッセージ受信時に`mark_room_read`をfire-and-forgetで呼ぶ。`visibleMessages`をレンダー内IIFEから`useMemo`へ切り出し（既読バッジ計算でも同じ非表示フィルタ済み一覧が必要になったため）。`readBadge`という`useMemo`で「自分が送った直近の既読済みメッセージ1件」を導出し、該当メッセージにのみ`MessageBubble`へ`readLabel`を渡す
- `components/chat/MessageBubble.tsx` — `readLabel?: string` propを追加。吹き出し外側・同じ側（送信者側）に小さく表示
- `components/chat/GroupMembersPanel.tsx` — グループ設定セクションに既読表示ON/OFFのチェックボックスを追加（オーナー限定・即時保存。名前/アバターと違いステージング不要な単純トグルのため）
- `app/actions/rooms.ts` — `updateGroupReadReceiptsEnabled(roomId, enabled)` Server Actionを追加（`updateGroupProfile`と同じオーナーチェックパターン）
- `app/(shell)/chat/[roomId]/page.tsx` / `components/chat/GatedChatRoomLoader.tsx` — `rooms`の`select`に`read_receipts_enabled`を、`room_members`の`select`に`last_read_at`を追加し、`ChatPeer`へ配線
- `types/supabase.ts` — マイグレーション適用後に`generate_typescript_types`で再生成
- `docs/schema.sql` — 適用済みマイグレーションを末尾に追記
- `docs/srs.md` — FR-25として既読機能を追加、Future Extensionsから「メッセージ既読管理」を削除、データモデル（`Room.read_receipts_enabled`・`RoomMember.last_read_at`）を追記
- `docs/architecture.md` — 既読機能の設計パターンを1行追加

### 設計判断・学び

- **PostgreSQLのRLSで「UPDATE時にUSING句が対象行を除外する」場合、例外は発生せず単に0行が更新されるだけ。** これはDB層検証で今回つまずいた点で、「非オーナーによる直接UPDATEが失敗すること」を確認するテストを最初「例外を期待する」形で書いてしまい、実際には例外が飛ばず（0行更新で正常終了）検証が想定と違う形で失敗した。RLSのUPDATE系ポリシー（`USING`句）の効果を確かめる時は、例外の有無ではなく「更新後の値が変化していないこと」を確認する必要がある。`docs/lessons.md`に教訓として追記
- **同一2ユーザー間で複数のDMルームが存在する場合、ルームごとにowner/memberの割り当てが異なりうる。** DB層のロールバックテストで実データ（本番の既存DM）を使い回すと、意図しないロールを拾って検証結果を誤読するリスクがある。以後、ロール等の前提条件を厳密に制御したいテストは、既存レコードを検索・流用せず明示的にテスト専用データをINSERTする方式に統一する
- 既読状態を「メッセージ単位」ではなく「閲覧位置（`last_read_at`）」で持つ設計は、書き込みコストが閲覧のたびに1行UPDATEで済み、グループの人数が増えても悪化しない（Discord/Slack等の一般的な実装と同じ考え方）。メッセージ単位で既読者を記録する設計（`message_hidden`に似た1行/メッセージ×ユーザー方式）は、グループの人数×メッセージ数で行数が爆発するため今回は採用しなかった
- 「バッジは自分が送った直近の既読済みメッセージ1件にのみ表示する」という表示ルールにしたのは、閲覧位置ベースの設計と相性が良いため（全既読済みメッセージにバッジを付けると、スクロールするたびに大量の「既読」表示が並んで冗長になる）
- サイドバー一覧への既読反映は意図的にスコープ外とした。`get_conversation_list`/`get_group_conversation_list`の戻り値拡張が追加で必要になり、実装コストの割にユーザーからの要望（チャット画面内での既読確認）を超える範囲だったため

### 検証方法・実施内容

- DB層：Supabase MCP `execute_sql`で`begin; ... rollback;`によるトランザクション内シミュレーションを実施。テスト専用ルームを明示ロールでINSERTした上で、(1) 非オーナーによる直接UPDATEが（例外ではなく）0行更新で終わること、(2) `mark_room_read`経由なら成功し自分の行のみ更新されること、(3) 非メンバーの`room_id`を渡すと例外になること、(4) メンバー同士は互いの`last_read_at`をSELECTできること（既読表示に必須）、(5) `read_receipts_enabled`はオーナーの素のUPDATEで更新でき非オーナーはできないこと、を確認してから本適用
- `get_advisors`（security）・`has_function_privilege`で新規関数の権限が既存パターンと同じであることを確認
- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件、リポジトリ全体）
- `npm run build`（`next build`、成功）

### 動作確認してほしい項目（実機確認待ち）

- DMで自分がメッセージを送信後、相手がチャットを開くと自分の画面に「既読」バッジがリアルタイムで表示されること（相手が新たにメッセージを送っても消えず、自分の直近の既読済みメッセージに付いたままであること）
- グループで複数メンバーが順に既読すると「既読1」→「既読2」...と件数がリアルタイムに増えていくこと
- グループのオーナーが「メンバー一覧」→グループ設定で既読表示をOFFにすると、既存の既読バッジも含めて全員の画面から消えること。再度ONにすると復活すること
- 非オーナーには既読表示のON/OFFトグル自体が表示されないこと（`isOwner &&`のブロック内にあるため）
- 新規グループ作成直後・新規DM開始直後は既読バッジが出ないこと（相手がまだ一度もそのルームを開いていない＝`last_read_at`がNULLのため）

### 未対応・持ち越し事項（Phase 29時点）

- サイドバー会話一覧への既読状態の反映（未読件数バッジ等）は未対応。要望が出た場合は`get_conversation_list`/`get_group_conversation_list`の戻り値拡張を伴う別Phaseとして検討する
- DM側の個人単位オプトアウト（既読を相手に送信しない設定）は今回のユーザー判断でv1スコープ外。将来要望が出た場合は`user_settings`への新規カラム追加を伴う
- 上記「動作確認してほしい項目」は実機未検証のまま次回に持ち越し

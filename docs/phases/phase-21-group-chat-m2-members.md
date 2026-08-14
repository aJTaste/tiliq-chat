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


## Phase 22 の実装内容・詳細

Phase 21（グループチャットメンバー管理M2）で明示的にスコープ外とした「オーナーの退出・オーナー譲渡・グループ削除」（M3）に着手。ユーザーから「次に何をやるべきか、自律的に計画してください」との指示を受けた。残バックログのうちサイドバー内部UI再設計・小粒課題群はユーザーの主観的な好みの確認が必要、自動テスト基盤導入は影響範囲の大きいツール選定判断のため次回相談すべき事項と判断し、機能追加として自然な続きである本項目（M1→M2→M3の流れ）を選んだ。

M3のスコープ：オーナーが別の既存メンバーへオーナー権を譲渡する機能、グループ削除機能。「オーナーの退出」は独立機能としては作らず、**譲渡してから既存の`leaveGroup`で退出する二段階フロー**として実現した（ゼロオーナー状態・自動オーナー継承は許容しない設計判断）。

### 設計上の重要な技術的知見

`room_members_update_owner`のRLS（`using (is_room_owner(room_id)) with check (is_room_owner(room_id))`）は、`is_room_owner`が「呼び出し者自身の行がowner役割か」をチェックするため、オーナーが自分自身の行を`owner`→`member`に更新しようとすると、`WITH CHECK`の再評価時点で既に呼び出し者はownerでなくなっており自己参照的に失敗する（`create_group_room`が最初のowner行挿入のためにRPCを要した「chicken-and-egg」問題と構造的に同じ）。そのため素のテーブルUPDATEでは実現不可能で、新規`transfer_group_ownership` RPC（security definer、RLSを完全にバイパスして2行のUPDATEをアトミックに行う）が必要だった。

一方グループ削除は既存の`rooms_delete_owner`RLS（`using (is_room_owner(id))`）が単一行DELETEを既に許可しており、`rooms`→`room_members`/`messages`のカスケード削除（`on delete cascade`）も効くため、**新規RPCは不要**（Server Action内の素のテーブル操作で十分。Phase 21のメンバー削除・退出と同じ理由）。

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase22_group_ownership_transfer_deletion_m3"）

新規RPC`transfer_group_ownership(p_room_id uuid, p_new_owner_id uuid)`のみ追加。既存パターン（security definer、`revoke from public`→`grant to authenticated`→`revoke from anon`の三点セット）を踏襲。

### 変更ファイル

- `app/actions/rooms.ts` — `transferGroupOwnership`・`deleteGroup`を追加。エラーマッピングは`mapAddMembersError`を使い回さず`mapTransferOwnershipError`を独立させた（`mapGroupError`/`mapAddMembersError`分離と同じ判断。既存文言が「追加」に紐づいており譲渡の文脈で不自然になるため）。`leaveGroup`のオーナー時エラーメッセージに「先にオーナーを譲渡してください。」を追記し、JSDocも二段階フローの説明に更新（M3で退出への導線が実在するようになったため、案内しないままだと実質的なUX後退になる）
- `components/chat/GroupMembersPanel.tsx` — 各メンバー行に「オーナーを譲渡」ボタンを追加（既存の「削除」ボタンと同じ表示条件、`flex flex-wrap justify-end gap-1`で狭い幅でも折り返せるように）。「グループを削除」ボタンをオーナー専用セクション末尾に追加（既存の退出ボタンと同じ危険操作スタイル）

**`components/chat/ChatRoom.tsx`・`components/chat/ChatRoomOptionsMenu.tsx`は無改修。** `isGroupOwner`は`groupMembers`（`ChatRoom.tsx`のローカルstate）から毎レンダー導出されるため、`onMembersChange`経由で`groupMembers`をパッチするだけでヘッダー・ボタン表示が自動的に正しく反映される（Phase 21で確立した設計の効果）。削除後の遷移も`GroupMembersPanel.tsx`が既に持つ`useRouter()`だけで完結する。

### 設計判断・学び

- **オーナー譲渡は`.map()`、追加/削除は`.filter()`/append。** 譲渡は行の追加・削除ではなく既存2行の`role`書き換えであるため、`GroupMembersPanel.tsx`の`onMembersChange`パッチロジックも`members.map(m => ...)`で自分を`member`に、対象を`owner`に書き換える形にした（既存の追加/削除ハンドラとは異なるデータ操作の性質）
- **DB層の検証で「旧オーナーが権限を失い、新オーナーが権限を持つ」ことを実際にRPC呼び出しで確認した。** `transfer_group_ownership`を実際にコミットした上で、別トランザクションで旧オーナー（test1）が`add_group_members`を呼べなくなること・新オーナー（test2）が呼べるようになることをSupabase MCPの`execute_sql`で直接検証した（型・ロジックの正しさだけでなく、RLS側の実際の権限移行も確認）
- **M3はM1/M2よりファイルtouch数が少なく完結した。** `ChatRoom.tsx`/`ChatRoomOptionsMenu.tsx`の無改修という設計上の帰結により、`app/actions/rooms.ts`と`GroupMembersPanel.tsx`の2ファイル＋1マイグレーションで完結した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `get_advisors`（security・performance）：新規`transfer_group_ownership`は既存の全RPCと同じ想定内の情報レベル警告のみ、新規の問題は無し
- Supabase MCPの`execute_sql`でDB層を直接検証：正常系（オーナー譲渡が成功しrole入れ替わりを確認）・異常系3パターン（非オーナー呼び出し・対象非メンバー・自己譲渡）・権限移行の実地確認（旧オーナー拒否・新オーナー許可）・グループ削除（オーナーによる削除成功＋カスケード削除・非オーナーによる削除がRLSで拒否）
- 実機での一連のQA（オーナー譲渡のUI即時反映、譲渡後の退出、グループ削除、非オーナーには両操作が一切見えないこと）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 22時点）

- グループ名の変更・アバター設定等、グループのプロフィール編集機能は引き続き未実装（M1〜M3のいずれのスコープにも含まれていない）
- サイドバー内部UI再設計・小粒課題群は引き続き別のバックログ項目のまま（ユーザーの好みの確認待ち）→ **サイドバー内部UI再設計はPhase 23で対応**


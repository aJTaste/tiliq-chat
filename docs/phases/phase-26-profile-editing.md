## Phase 26 の実装内容・詳細

`docs/backlog.md`の実機フィードバック由来の小粒課題「ユーザーごとのプロフィール・アイコン編集の概念が欲しい（`profiles.avatar_url`列自体は既存だが編集UIが無い）」に対応。

このPhaseはユーザーのClaude Pro契約が当日で一旦切れる（再開時期は未定）という制約下で着手した。バックログ上の複数候補（プロフィール編集UI／一時チャット名前付け／メッセージ送信ポリシー見直し／スクロールバー見た目調整）の中から、「Claude Codeの強み（複数ファイルにまたがる既存資産の組み合わせ・コードベース全体の文脈把握）が最も活きる」という基準でこの項目をユーザーの了承のもとClaudeが選定した（他候補は設計合意が別途必要、または単純なCSS変更で完結するため相対的に優先度を下げた）。

### 概要

表示名（`display_name`）とアバター画像（`avatar_url`）を設定画面から編集できるようにした。`username`（ユーザーID）は一意制約付きのID的な扱いのため対象外とし、読み取り専用表示のみ追加した。

### 追加ファイル

- `app/api/cloudinary/sign-avatar/route.ts` — プロフィールアバター専用のCloudinary署名発行Route Handler。既存の`app/api/cloudinary/sign/route.ts`は`roomId`必須（`is_room_member`検証あり、フォルダを`tiliqua/rooms/{roomId}`から導出）だが、プロフィールアバターには紐づく`roomId`が存在しないため分離した（フォルダは`tiliqua/avatars/{userId}`）。認証チェックのみでよい理由：更新先が`profiles.avatar_url`のみであり、そちらは`profiles_update_own`のRLS（`id = auth.uid()`）で別途保護されるため
- `components/settings/ProfileSettingsForm.tsx` — プロフィール編集フォーム本体
- `docs/phases/phase-26-profile-editing.md` — このファイル

### 変更ファイル

- `lib/cloudinary/upload.ts` — `uploadAvatarToCloudinary`を追加（`/api/cloudinary/sign-avatar`を叩く以外は既存の`uploadImageToCloudinary`と同じ流れ）
- `app/actions/settings.ts` — `updateProfile({ displayName, avatarUrl })` Server Actionを追加。表示名は1〜30文字（`profiles.display_name_length`制約と一致）をアプリ側でも事前検証
- `app/settings/page.tsx` — `ProfileSettingsForm`を設置。`profiles`取得を既存の`user_settings`取得と`Promise.all`で並列化（`app/(shell)/layout.tsx`の既存パターンを踏襲）

### DB変更

なし。`profiles_update_own`ポリシー（`using(id = auth.uid()) with check(id = auth.uid())`、カラム制限なし）が既に`display_name`/`avatar_url`の自己更新を許可していたため、新規マイグレーション・RPCともに不要だった。

### 設計判断・学び

- **今回の「専用RPCが要るかどうか」判断は`docs/lessons.md`の既存の分岐（「更新対象が判定条件そのものを書き換えるか」）通りに機械的に決着した。** `avatar_url`/`display_name`はどのRLSポリシーの判定条件にも使われていないため、素のテーブルUPDATEで完結すると事前に判断でき、実装時にも実際そのまま通った。既存の教訓が新しい機能でもそのまま再利用できた実例として記録しておく
- アバターアップロードのステージングUI（選択直後はプレビューのみ・保存時に`compressImage`→アップロード）は`components/chat/GroupMembersPanel.tsx`（Phase 24のグループアバター編集）と全く同じパターンを流用した。差分は「roomIdに依存しない署名エンドポイントが必要だった」点のみで、UIロジック自体の新規設計は不要だった
- Cloudinaryの署名エンドポイントを`roomId`ベース（既存）と`userId`ベース（今回）で分けたのは、既存の`/api/cloudinary/sign`が「roomIdのメンバーシップ検証」を前提にした設計だったため。ここへ`purpose`パラメータ等で分岐を足すより、用途ごとに小さなRoute Handlerを追加するほうが既存コードへの影響がなく安全と判断した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint app/api/cloudinary/sign-avatar/route.ts lib/cloudinary/upload.ts app/actions/settings.ts components/settings/ProfileSettingsForm.tsx app/settings/page.tsx`（エラー0件）
- `npm run build`（`next build`、成功。`/api/cloudinary/sign-avatar`が動的ルートとして正しく認識されることを確認）
- DB変更が無いため`get_advisors`等のDB層検証は実施していない
- ユーザーのPro契約期限当日の作業だったため、実機・ブラウザでのE2E的な動作確認（画像アップロード実物確認・表示名変更の反映確認）はこのセッションでは行っていない

### 動作確認してほしい項目（実機確認待ち）

- 設定画面でアバター画像を選択→保存すると、Cloudinary（`tiliqua/avatars/{userId}`フォルダ）にアップロードされ、画面上のアバターが更新されること
- 「画像を削除」→保存で、アバターが未設定状態（イニシャル表示）に戻ること
- 表示名を変更→保存すると即座に反映され、他画面（メッセージのグループ送信者名表示等）にも次回取得時から反映されること
- 表示名を空欄または31文字以上にした場合、保存がブロックされエラーメッセージが表示されること
- 画像未選択・表示名も未変更の状態では保存ボタンが無効化されていること

### 未対応・持ち越し事項（Phase 26時点）

- 上記「動作確認してほしい項目」はいずれも実機未検証のまま。ユーザーのClaude Code利用再開後、最初に確認すべき項目として残る
- `username`（ユーザーID）自体の変更UIは今回スコープ外のまま（一意制約・検索や既存DM関係への影響範囲の設計判断が別途必要なため、着手するなら別Phaseとして扱う）

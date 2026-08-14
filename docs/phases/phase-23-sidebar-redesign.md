## Phase 23 の実装内容・詳細

CLAUDE.md「次にやること」候補4（サイドバー内部UIの再設計）に着手。Phase 16でユーザーから出ていた当初構想（「ユーザー検索」「チャット一覧（統合＋種別絞り込み）」の2画面切替＋「＋」新規作成メニュー、種別切替はタブ型で）に沿って、Phase 17で骨組みのみ実装していたサイドバー内部（`AddUserPanel.tsx`・`HomeTabs.tsx`・`CreateGroupPanel.tsx`）を再設計した。実装前にExplore→AskUserQuestion→Planエージェントの計画フローを経て、ユーザーに4つの分岐点（切替UIの見た目・PC幅の挙動・一覧の統合要否・＋メニューの範囲）を確認してから着手した。

### ユーザーが確定した設計方針

1. サイドバー最上部に「検索」「一覧」の2タブを配置し、クリックで排他的に表示を切り替える
2. PCも含め常に排他表示（Phase 13の「AddUserPanel PC常時展開」は撤回）
3. フレンド/ストレンジャー/グループを直近メッセージ順に統合した「すべて」ビューを基本とし、フレンド/ストレンジャー/グループの絞り込みタブも維持する
4. グループ作成・一時チャット作成の両方を「＋」アイコンのメニューに集約する。通常のDM開始・フレンド申請は引き続き「検索」タブから行う

### 追加ファイル

- `components/ui/Modal.tsx` — 汎用モーダルラッパー（背景クリック・Escapeキーで`onClose`、`role="dialog"` `aria-modal`）。既存の`GroupMembersPanel.tsx`が持つ`fixed inset-0 z-20 flex items-center justify-center bg-ink/40 backdrop-blur-sm`パターンを踏襲。中身のパディング・タイトルは持たせず子コンポーネント側の裁量に残す設計。**新規2箇所（`CreateGroupPanel.tsx`・`CreateTempChatPanel.tsx`）にのみ適用し、既存の`GroupMembersPanel.tsx`自体は追従させていない**（無関係な既存ファイルへの染み出しを避けるため、今回のスコープ外とした）
- `components/home/CreateTempChatPanel.tsx` — サイドバー「＋」メニューから開く一時チャット作成モーダル。旧`AddUserPanel.tsx`の検索結果行に埋め込まれていた有効期限セレクター（`DURATION_OPTIONS`等）をここに移設し、`CreateGroupPanel.tsx`と同じ`search_users`デバウンス検索パターンに載せ替えた。グループ作成と異なり単一選択（`Map`ではなく`selected: SearchResult | null`）。既にDMルームがある相手は`create_temp_dm_room`が既存ルーム検索をしない仕様のため選択不可にする（旧`AddUserPanel.tsx`の`!r.existingRoomId`ガードを踏襲）

### 変更ファイル

- `components/home/SidebarNav.tsx`（新規） — サイドバー全体の合成コンポーネント。「検索」「一覧」タブバー＋未読フレンド申請バッジ＋「＋」ドロップダウン（`ChatRoomOptionsMenu.tsx`と同じ`wrapperRef`+`mousedown`外側クリック検知パターン）＋選択中ビュー（`AddUserPanel`または`HomeTabs`）を1つにまとめる。`app/(shell)/layout.tsx`と`components/shell/GatedShellBody.tsx`の2箇所で重複していた`<AddUserPanel/><HomeTabs/>`組み立てJSXをここに集約した副産物もある
- `components/home/AddUserPanel.tsx` — 開閉chrome（`open` state・モバイル固定ボトムバー・PC常時展開用の固定幅スタイル・トグルボタン）を全削除し、親（`SidebarNav`）から表示/非表示を制御される単純な内容物に縮小。有効期限セレクター関連を`CreateTempChatPanel.tsx`へ移設したため、「メッセージ」ボタンは常に`startDirectMessageWithUser`のみを呼ぶ単純な形になった。未読バッジの表示・既読化トリガーも`SidebarNav.tsx`へ移管
- `components/home/HomeTabs.tsx` — `TabKey`に`"all"`を追加してデフォルト化。「すべて」選択時はDM・グループを`lastMessageAt`降順（nullは最下部）で統合ソートして表示する。「＋グループを作成」ボタン＋`CreateGroupPanel`のインライン展開ブロックを削除（サイドバー「＋」メニューに移管したため`CreateGroupPanel`への依存自体が無くなった）。FR-14検索欄を全タブで常時表示にし、フィルタ述語もグループ（`groupName`/`memberNames`）を対象に含めるよう拡張した
- `components/home/CreateGroupPanel.tsx` — ルート要素を新設`Modal`でラップし、`GroupMembersPanel.tsx`と統一した見た目のタイトル行＋「×」ボタンを追加。呼び出され方が「`HomeTabs.tsx`のグループタブ内にインライン展開」から「サイドバー『＋』メニューから開くモーダル」に変わった
- `components/shell/ShellRow.tsx` — サイドバーラッパーの幅を`md:w-[32rem]`→`md:w-80`（暫定値、実機確認後に再調整前提）に縮小し、`md:flex-row`を削除。以前はAddUserPanel+HomeTabsの2カラム横並び用の指定だったが、今回からサイドバーは`SidebarNav`単体（内部で検索/一覧を排他表示）になったため不要になった
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — `<AddUserPanel/><HomeTabs/>`のフラグメントを`<SidebarNav .../>`呼び出し1つに置換。データ取得（`Promise.all`）自体は無変更

### 設計判断・学び

- **「＋」メニューから開くモーダルの自動クローズが必須の対策だった。** `createGroupRoom`/`startTemporaryDirectMessage`は成功時にServer Action内で`redirect()`する既存の設計（変更不可）だが、これらを呼ぶ`CreateGroupPanel`/`CreateTempChatPanel`は永続サイドバーシェルの一部（`SidebarNav`、`app/(shell)/layout.tsx`配下）にマウントされる。Phase 17の設計通りこの階層はナビゲーションで再マウントされないため、何もしないと「グループ作成→新しいチャット画面に遷移したのにモーダルが画面に残る」という不具合になるところだった（`GroupMembersPanel.tsx`が同じ問題を起こさないのは、`template.tsx`によりroomId変更ごとに強制リマウントされる非永続領域＝`{children}`側にあるため）。対策として`SidebarNav.tsx`で`usePathname()`（URL由来でハイドレーション不一致の心配がない、`ShellRow.tsx`の`useSelectedLayoutSegment()`と同種の方針）を監視し、変化したら`activeModal`のみをリセットするようにした（「検索」/「一覧」タブの選択状態はナビゲーションをまたいで保持してよいためリセット対象に含めない）
- **未読フレンド申請バッジの自動既読化トリガーを`open`（旧AddUserPanel.tsx自身の開閉状態）から`activeView === "search"`（SidebarNav側）に移したことで、Phase 13の既知の制約「PCでは未読バッジが自動で消えない」が副産物的に解消された。** 旧実装はPCで`open`が常にfalseのまま変化しなかったため既読化effectが発火せず、ヘッダーのトグルボタンをこの副作用を手動発火させるためだけに残す非対称設計になっていた。今回はPC・モバイル問わず「検索」タブに切り替えた瞬間に一貫して発火する
- **モーダルの共通化はrule of threeを満たすが、既存の`GroupMembersPanel.tsx`自体への追従は見送った。** 新設2箇所（`CreateGroupPanel`・`CreateTempChatPanel`）だけを対象にすることで、今回のタスク（サイドバー再設計）と無関係な既存ファイルへの差分・回帰リスクを広げないようにした（`GroupMembersPanel.tsx`のModal化は任意の低優先度クリーンアップとして残す）
- **FR-14検索欄をグループタブでも表示する変更に伴い、フィルタ述語の拡張が必須だった。** 表示条件だけを緩めてフィルタ述語（DM専用の判定のみ）を直さないと、グループタブで検索欄が見えるのに何も効かない壊れたUIになるため、`groupName`/`memberNames`の部分一致もあわせて追加した
- **サイドバー幅`md:w-[32rem]`（旧：AddUserPanel固定18rem＋HomeTabs残り約14remの2カラム横並び用）を`md:w-80`（20rem/320px）に縮小した。** 単一ビュー表示になったため2カラム前提の幅は過大と判断したが、Phase 17の記録と同様この値も実機確認後の再調整を前提とした暫定値として扱う
- **Planエージェントによる設計提案を、実ファイル（`AddUserPanel.tsx`・`CreateGroupPanel.tsx`・`ShellRow.tsx`・`app/(shell)/layout.tsx`・`GatedShellBody.tsx`）の直接確認で検証してから実装に入った。** 行番号・クラス名の記述はすべて実コードと一致しており、特に上記「＋メニューモーダルの自動クローズ」の論点は実装前の設計段階で発見できたため、手戻りなく実装できた

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（`SidebarNav.tsx`の`usePathname()`監視effectで`react-hooks/set-state-in-effect`が1件検出されたため、既存踏襲パターン通り`eslint-disable-next-line`を追加して解消。最終的にエラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- DB層の変更は無し（既存の`search_users`／`startDirectMessageWithUser`／`startTemporaryDirectMessage`／`createGroupRoom`／`markFriendRequestsRead`等をシグネチャ・戻り値とも変えずに呼び出し元だけ再配線したため、`execute_sql`等でのDB検証・`types/supabase.ts`再生成は不要と判断し実施していない）
- 実機での一連のQA（検索/一覧タブの排他切替、統合「すべて」ビューのソート、＋メニューからのグループ/一時チャット作成とモーダル自動クローズ、起動時ゲート有効時の`GatedShellBody`経路含む）はユーザーによる実機確認待ち

### デザイン修正（同セッション内で追加対応）

実機を見たユーザーから「全体的に要素サイズが大きい（情報量が増えたときに窮屈・長い文字列がはみ出す・一度に表示できる会話数が少ない・今後の機能追加に耐えない）」「検索/一覧タブが左に寄りすぎ、もっと広く大きく使ってほしい」「一覧のサブフィルタ（すべて/フレンド/ストレンジャー/グループ）はスペースを取らないセレクトメニュー形式に」「未フレンド等の状態チップは不要、削除」という4点の指摘があり対応した。ユーザーからは「その他に改善できると判断した場合、改善内容を提示することを条件に修正して構わない」との裁量も与えられたため、密度に関わる周辺箇所もあわせて調整した。

**明示的な指摘への対応：**

- `components/home/SidebarNav.tsx` — 「検索」「一覧」タブを、小さいテキストボタンが左寄りに並ぶ形から、行の大部分（`flex-1`ずつ）を占めるセグメントコントロール（`rounded-lg bg-surface p-1`の枠内に、アクティブ側が`bg-tongue text-white`のピル状にハイライトされる2ボタン）に変更。フォントも`text-xs`→`text-sm`、パディングも`px-4 py-3`→`px-4 py-2.5`（横幅拡大に伴い縦は微調整）に。「＋」ボタンも`h-8 w-8`→`h-10 w-10`に拡大し、大きくなった切替コントロールとの視覚的バランスを取った
- `components/home/HomeTabs.tsx` — サブフィルタの4ボタン（`TabButton`、件数バッジ付き）を廃止し`<select>`1つに置き換え。検索欄と同じ行に横並び配置することで、専用の行を消費しないようにした（`TabButton`関数自体も未使用になったため削除）。件数表示は「スペースを取らない」という要求に合わせて割愛した（選び直せば件数は一覧の長さで分かるため実害は小さいと判断）
- `ConversationRow`（`HomeTabs.tsx`） — フレンド状態チップ（`FRIENDSHIP_BADGE`による「未フレンド」「申請中」「申請あり」等の表示）を完全に削除。定数`FRIENDSHIP_BADGE`自体も未使用になったため削除した。一時チャットの残り時間バッジ（`isTemporary`）は情報の性質が異なる（期限切れが近いという時間的に重要な警告であり、装飾的な状態表示ではない）ため区別して残した

**密度改善のため追加で調整した箇所（ユーザーへの提示事項）：**

- `AddUserPanel.tsx` — 外枠パディング`px-6 py-4`→`px-4 py-3`、要素間`gap-4`→`gap-3`。検索結果・フレンド申請・ブロック中一覧の各行を`py-2`→`py-1.5`、リスト間隔`gap-2`→`gap-1.5`に統一して圧縮
- `ConversationRow`/`GroupConversationRow`（`HomeTabs.tsx`） — 行パディング`px-6 py-4`→`px-4 py-2.5`、アバター`h-10 w-10`→`h-8 w-8`、直近メッセージプレビューの文字サイズを`text-sm`→`text-xs`に縮小（「一度に表示できる会話数が少なすぎる」への対応として、1行あたりの高さを詰めた）
- `CreateGroupPanel.tsx`/`CreateTempChatPanel.tsx`（モーダル） — 内側パディング`p-4`→`p-3`、要素間`gap-3`→`gap-2.5`

**設計判断：** 「検索/一覧」タブだけは他の要素と逆方向（拡大）の調整を行った。これはユーザーの指摘が「全ての要素が一律に大きい」ではなく「繰り返し表示される要素（一覧の行・チップ・サブフィルタボタン）は密度を優先すべきだが、画面の最上位にあるナビゲーション自体は存在感を持たせて広く使うべき」という区別だったと解釈したため。この解釈が違う場合はフィードバックをお願いしたい。

**検証：** `npx tsc --noEmit`・`npx eslint .`・`rm -rf .next && npm run build`いずれもエラー0件を確認。DB層の変更は無し。実機での見た目確認はユーザー待ち。

### 未対応・持ち越し事項（Phase 23時点）

- `docs/srs.md` 3.2.1節に残る「独立した検索タブとしては実装せず」という注記（Phase 5→Phase 15で確定した記述）が、今回の変更で実態と乖離した（今回まさに独立した「検索」タブを新設したため）。別セッションでの整合作業を推奨（Phase 15と同種の対応）
- `GroupMembersPanel.tsx`を新設`components/ui/Modal.tsx`へ追従させる作業（任意の低優先度クリーンアップ）
- サイドバー幅`md:w-80`は暫定値、実機確認後の再調整余地あり
- モバイルでチャット画面から一覧へ戻るUIが無い問題（Phase 16由来、既存バックログ）は今回もスコープ外のまま


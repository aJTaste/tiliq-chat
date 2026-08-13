/**
 * Phase 17: 永続サイドバーシェル化により、サイドバーから直接チャットA→チャットBへ
 * 遷移する操作が新たに可能になった。`layout.tsx`はルート間で状態を保持するが
 * （このシェル自体がまさにそれを利用している）、`template.tsx`は動的パラメータ
 * （roomId）が変わるごとに一意なkeyでリマウントされる、というNext.jsのファイル規約の
 * 違いを利用して、roomId切り替え時に配下（AuthGate／GatedChatRoomLoader／ChatRoom
 * のいずれの経路でも）を確実にリマウントさせるための空実装。
 *
 * これが無いと2つの実害がありうる：
 * 1. ChatRoom.tsxはuseState(initialMessages)等、初回propsからのみ状態初期化する
 *    設計のため、チャットBに切り替えたのにチャットAの内容が残って見えることがある
 * 2. より深刻なのはAuthGate.tsx：sessionStorage確認がuseEffect(() => {...}, [])
 *    （マウント時1回のみ）のため、scopeKeyがroom:A→room:Bと変わっても再マウント
 *    されない限り再チェックされない。ロック中のBが、直前に解錠したAの解錠状態の
 *    まま見えてしまうセキュリティ上のリスクになりうる
 */
export default function ChatRoomTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

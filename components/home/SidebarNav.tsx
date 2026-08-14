"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { markFriendRequestsRead } from "@/app/actions/friends";
import {
  AddUserPanel,
  type BlockedUserItem,
  type FriendRequestItem,
} from "./AddUserPanel";
import { HomeTabs, type ConversationItem } from "./HomeTabs";
import { CreateGroupPanel } from "./CreateGroupPanel";
import { CreateTempChatPanel } from "./CreateTempChatPanel";

type ActiveView = "list" | "search";
type CreateModalKind = "group" | "temp" | null;

/**
 * サイドバーUI再設計：サイドバー全体の合成コンポーネント。「検索」「一覧」タブの
 * 排他表示（PC・モバイル問わず。Phase13の「AddUserPanel PC常時展開」は撤回した）＋
 * 「＋」新規作成メニュー（グループ作成／一時チャット作成）＋選択中ビューの描画を
 * 1箇所にまとめる。app/(shell)/layout.tsx・components/shell/GatedShellBody.tsxの
 * 2箇所で重複していた<AddUserPanel/><HomeTabs/>の組み立てJSXをここに集約した。
 *
 * 未読フレンド申請バッジは「検索」タブボタンに表示し、`activeView`が"search"に
 * なった瞬間に既読化する（旧AddUserPanel.tsxの`open`起点だった既読化トリガーを
 * ここに移管。PC・モバイル問わず一貫して自動既読化されるようになり、Phase13の
 * 既知の制約「PCでは未読バッジが自動で消えない」が解消される）。
 */
export function SidebarNav({
  initialRequests,
  initialBlockedUsers,
  conversations,
  loadError = false,
}: {
  initialRequests: FriendRequestItem[];
  initialBlockedUsers: BlockedUserItem[];
  conversations: ConversationItem[];
  loadError?: boolean;
}) {
  const pathname = usePathname();
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<CreateModalKind>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = initialRequests.filter(
    (r) => r.direction === "received" && r.status === "pending" && !r.isRead,
  ).length;

  useEffect(() => {
    if (activeView !== "search" || unreadCount === 0) return;
    // 既読化はバックグラウンド処理のため、通信エラー等で失敗してもUI上は無視する
    // （未処理のPromise rejectionにならないようcatchのみ行う。旧AddUserPanel.tsxの
    // 既読化effectと同じ方針）。
    markFriendRequestsRead().catch(() => {});
  }, [activeView, unreadCount]);

  // createGroupRoom/startTemporaryDirectMessageは成功時にServer Action内でredirect()
  // する（変更不可の既存設計）。このコンポーネントは永続サイドバーシェルの一部
  // （app/(shell)/layout.tsx配下）で、/home⇔/chat/[roomId]間のナビゲーションでは
  // 再マウントされないため、何もしないと遷移後もモーダルが画面に残ってしまう
  // （GroupMembersPanel.tsxが同じ問題を起こさないのは、それがtemplate.tsxにより
  // roomId変更ごとに強制リマウントされる非永続領域=childrenの中にあるため）。
  // pathname変化を検知して自動的に閉じる。「検索」/「一覧」タブの選択状態は
  // ナビゲーションをまたいで保持してよいため、リセット対象はモーダルのみに限定する。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveModal(null);
  }, [pathname]);

  useEffect(() => {
    if (!createMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [createMenuOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-band/60 p-2">
        {/* デザイン修正：検索/一覧の切替は最上位のナビゲーションのため、他の要素とは
            逆に幅・タップ領域を広く取る（セグメントコントロール形式）。 */}
        <div className="flex flex-1 gap-1 rounded-lg bg-surface p-1">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeView === "list"
                ? "bg-tongue text-white"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            一覧
          </button>
          <button
            type="button"
            onClick={() => setActiveView("search")}
            className={`relative flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeView === "search"
                ? "bg-tongue text-white"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            検索
            {unreadCount > 0 && activeView !== "search" && (
              <span className="absolute right-2 top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-medium text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setCreateMenuOpen((v) => !v)}
            aria-label="新規作成"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-band text-lg text-ink-muted transition-colors hover:bg-surface-raised"
          >
            ＋
          </button>
          {createMenuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 flex w-48 flex-col overflow-hidden rounded-lg border border-band bg-surface-raised text-sm shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setActiveModal("group");
                  setCreateMenuOpen(false);
                }}
                className="px-3 py-2 text-left text-ink transition-colors hover:bg-band/30"
              >
                グループを作成
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal("temp");
                  setCreateMenuOpen(false);
                }}
                className="px-3 py-2 text-left text-ink transition-colors hover:bg-band/30"
              >
                一時チャットを作成
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeView === "search" ? (
          <AddUserPanel
            initialRequests={initialRequests}
            initialBlockedUsers={initialBlockedUsers}
          />
        ) : (
          <HomeTabs conversations={conversations} loadError={loadError} />
        )}
      </div>

      {activeModal === "group" && (
        <CreateGroupPanel onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "temp" && (
        <CreateTempChatPanel onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
}

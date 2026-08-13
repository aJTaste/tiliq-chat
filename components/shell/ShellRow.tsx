"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 永続サイドバーシェル（Phase 17・M1）のペイン分割。
 * PC幅（md:）ではサイドバーとメインコンテンツを常時左右に並べる。
 * スマホ幅では「サイドバー（会話一覧）」「メインコンテンツ（チャット等）」の
 * どちらか一方のみをフルスクリーン表示する、従来通りのページ遷移的な見た目に戻す。
 *
 * 表示切り替えの判定にはuseSelectedLayoutSegment()を使う。これはURL（ルート状態）
 * 由来の値でサーバー・クライアントで同じ結果になるため、AuthGate.tsx/OfflineBanner.tsx
 * が使うsessionStorage/navigator.onLineベースの判定とは異なりハイドレーション
 * 不一致のリスクが無い。
 */
export function ShellRow({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const segment = useSelectedLayoutSegment(); // "home" | "chat" | null
  const showSidebar = segment !== "chat";

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        className={`${showSidebar ? "flex" : "hidden"} min-h-0 w-full flex-col md:flex md:w-[32rem] md:shrink-0 md:flex-row md:border-r md:border-band/60`}
      >
        {sidebar}
      </div>
      <div
        className={`${showSidebar ? "hidden" : "flex"} min-h-0 flex-1 flex-col md:flex md:min-w-0`}
      >
        {children}
      </div>
    </div>
  );
}

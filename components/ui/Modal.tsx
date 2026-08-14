"use client";

import { useEffect, type ReactNode } from "react";

/**
 * サイドバーUI再設計（＋メニュー由来のCreateGroupPanel/CreateTempChatPanel）で新設した
 * 汎用モーダルラッパー。背景クリック・Escapeキーでoncloseを呼び、role="dialog"
 * aria-modalを持つ。既存のGroupMembersPanel.tsxが持つ
 * `fixed inset-0 z-20 flex items-center justify-center bg-ink/40 backdrop-blur-sm`
 * パターンを踏襲する。
 *
 * 意図的に中身のパディング・タイトル・枠線は持たせない（既存のGroupMembersPanel.tsxが
 * p-4、旧CreateGroupPanel.tsxがp-3と、内側パディングが元々揃っていなかったため、
 * これを子コンテンツ側の裁量に残すことで既存の見た目を変えずに済む）。
 * `labelledBy`には子コンテンツ側が持つタイトル要素のidを渡す。
 *
 * 既存のGroupMembersPanel.tsx自体はこのModalへ追従させていない（今回のスコープ外。
 * CLAUDE.md参照）。
 */
export function Modal({
  onClose,
  maxWidthClassName = "max-w-sm",
  labelledBy,
  children,
}: {
  onClose: () => void;
  maxWidthClassName?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidthClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

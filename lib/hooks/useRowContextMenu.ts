"use client";

import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent, type MouseEvent as ReactMouseEvent } from "react";

// FR-16/FR-17実装（components/chat/MessageBubble.tsx）が持つ「長押し（タッチ）・
// 右クリック（PC）でその場にメニューを表示する」パターンを、一覧行（ホーム画面の
// DM行・検索結果行）向けに切り出したフック（Phase 25：チャット画面からの一時チャット
// 作成）。MessageBubble.tsx自体はこのフックへ追従させていない（対象がLinkを含まない
// 単純なdivのため、下記の「長押し後のゴーストクリック抑止」処理が不要で、既存の
// 挙動を変えるリスクを避けた）。
const LONG_PRESS_MS = 500;

export function useRowContextMenu<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<T | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 長押しでメニューが開いた直後、指を離す操作が対象要素（Linkの場合は遷移、
  // buttonの場合はクリック）への通常タップと区別できず後続のclickイベントとして
  // 発火してしまう（＝メニューを開いた瞬間に意図せず遷移する）ことがある。
  // 長押しが実際に発火したかをこのrefで覚えておき、その場合のみtouchendで
  // preventDefault()してゴーストクリックを抑止する。
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside as EventListener);
    document.addEventListener("touchstart", handleOutside as EventListener);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside as EventListener);
      document.removeEventListener("touchstart", handleOutside as EventListener);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onContextMenu(e: ReactMouseEvent) {
    e.preventDefault();
    setOpen(true);
  }

  function onTouchStart() {
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  }

  function onTouchEnd(e: ReactTouchEvent) {
    clearLongPressTimer();
    if (longPressFiredRef.current) {
      e.preventDefault();
      longPressFiredRef.current = false;
    }
  }

  function onTouchMove() {
    clearLongPressTimer();
    longPressFiredRef.current = false;
  }

  return {
    open,
    setOpen,
    close: () => setOpen(false),
    wrapperRef,
    rowHandlers: { onContextMenu, onTouchStart, onTouchEnd, onTouchMove },
  };
}

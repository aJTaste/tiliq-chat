"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Phase 17: 起動時ゲートが無効なアカウント専用。friendshipsのRealtime変更を
 * 購読し、相手側の操作（申請・承認・拒否・取り消し・解除）をリロード無しで
 * 反映する（Phase 10由来。旧HomeContent.tsxの非ゲート時effectをシェル化に
 * 合わせて切り出した）。router.refresh()でapp/(shell)/layout.tsxを再実行させ、
 * 新しいpropsをHomeHeader/AddUserPanel/HomeTabsへ流す。
 */
export function ShellFriendshipsSync({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shell-friendships:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}

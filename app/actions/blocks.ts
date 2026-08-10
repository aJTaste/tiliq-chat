"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * FR-23: ユーザーをブロックする。
 * block_user RPC側で、既存のフレンド関係（承認済み/申請中いずれも）も合わせて解消する。
 */
export async function blockUser(targetUserId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("block_user", {
    p_target_id: targetUserId,
  });

  if (error) {
    return {
      success: false,
      error: "ブロックに失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/home");
  return { success: true };
}

/**
 * ブロック解除。blocksテーブルはRLS（blocks_delete_own）で自分の行のみ削除可能なため
 * RPCを介さず直接テーブル操作で行う。
 */
export async function unblockUser(targetUserId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);

  if (error) {
    return { success: false, error: "ブロック解除に失敗しました。" };
  }

  revalidatePath("/home");
  return { success: true };
}

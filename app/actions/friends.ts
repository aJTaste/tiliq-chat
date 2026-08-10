"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

function mapFriendshipError(message: string): string {
  if (message.includes("already friends")) return "既にフレンドです。";
  if (message.includes("already pending")) return "既に申請中です。";
  if (message.includes("cannot friend yourself"))
    return "自分自身には申請できません。";
  if (message.includes("blocked"))
    return "ブロック関係にあるため申請できません。";
  if (message.includes("user not found")) return "ユーザーが見つかりません。";
  return "フレンド申請に失敗しました。時間をおいて再度お試しください。";
}

/** FR-11: ユーザーIDで検索した相手にフレンド申請を送る */
export async function sendFriendRequest(
  targetUserId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("send_friend_request", {
    p_addressee_id: targetUserId,
  });

  if (error) {
    return { success: false, error: mapFriendshipError(error.message) };
  }

  revalidatePath("/home");
  return { success: true };
}

/** FR-11: 受信したフレンド申請を承認・拒否する */
export async function respondToFriendRequest(
  friendshipId: string,
  accept: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("respond_to_friend_request", {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });

  if (error) {
    return {
      success: false,
      error: "操作に失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/home");
  return { success: true };
}

/** 自分が送信した申請中のリクエストを取り消す */
export async function cancelFriendRequest(
  friendshipId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("cancel_friend_request", {
    p_friendship_id: friendshipId,
  });

  if (error) {
    return { success: false, error: "取り消しに失敗しました。" };
  }

  revalidatePath("/home");
  return { success: true };
}

/** フレンド解除（承認済みの関係を削除） */
export async function removeFriend(otherUserId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("remove_friend", {
    p_other_user_id: otherUserId,
  });

  if (error) {
    return { success: false, error: "フレンド解除に失敗しました。" };
  }

  revalidatePath("/home");
  return { success: true };
}

/**
 * FR-11: 「無視は通知なし、バッジのみ既読扱い」対応。
 * ユーザー追加パネルを開いたタイミングで、受信済みの未読リクエストを既読にする。
 */
export async function markFriendRequestsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.rpc("mark_friend_requests_read");
  revalidatePath("/home");
}

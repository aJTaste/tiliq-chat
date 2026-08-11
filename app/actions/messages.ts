"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * FR-16: 自分の送信メッセージを論理削除する（送信者・受信者どちらの画面からも消える）。
 *
 * 直接のテーブルUPDATE（messages_update_own_delete_onlyポリシー経由）は使わず、
 * delete_own_message RPC（SECURITY DEFINER）経由にしている。理由：PostgreSQLのRLSは
 * UPDATE時に「更新後の新しい行がSELECTポリシーからも見える状態であること」を暗黙的に
 * 要求するため、messages_update_own_delete_onlyのWITH CHECK（sender_id = auth.uid()）自体は
 * 満たしていても、messages_select_member_not_deletedポリシー（deleted_at is nullを要求）と
 * 衝突し、常に"new row violates row-level security policy"で失敗することが実機検証で判明した。
 * RPC内で明示的にsender_id = auth.uid()を確認することでRLSと同等の保護を維持しつつ、
 * SECURITY DEFINERによりRLSのこの制約を回避している。
 */
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("delete_own_message", {
    p_message_id: messageId,
  });

  if (error) {
    return { success: false, error: "メッセージの削除に失敗しました。" };
  }

  return { success: true };
}

/**
 * FR-17: 自分の画面からのみメッセージを非表示にする（他者には一切影響しない）。
 */
export async function hideMessage(messageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("message_hidden")
    .insert({ message_id: messageId, user_id: user.id });

  if (error) {
    return { success: false, error: "メッセージの非表示に失敗しました。" };
  }

  return { success: true };
}

/**
 * FR-18: 非表示の解除（復元）。非表示メッセージ一覧画面から呼び出される想定。
 */
export async function unhideMessage(messageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("message_hidden")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "非表示の解除に失敗しました。" };
  }

  return { success: true };
}

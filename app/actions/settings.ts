"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * FR-22: 知らない人からのDM受信設定のオン/オフ。
 * 専用の設定画面はPhase 7予定のため、暫定的にホーム画面ヘッダーのトグルから変更する
 * （CLAUDE.md「検討中のアイデア」参照）。
 */
export async function updateDmFromStrangerSetting(
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ dm_from_stranger_enabled: enabled })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "設定の更新に失敗しました。" };
  }

  revalidatePath("/home");
  return { success: true };
}

/**
 * FR-20: 追加認証を起動時にも要求するかのトグル。
 */
export async function updateAuthScopeLaunch(
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ auth_scope_launch: enabled })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "設定の更新に失敗しました。" };
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * FR-20: 追加認証を非表示メッセージ一覧の閲覧時にも要求するかのトグル。
 */
export async function updateAuthScopeHiddenList(
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ auth_scope_hidden_list: enabled })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "設定の更新に失敗しました。" };
  }

  revalidatePath("/settings");
  return { success: true };
}

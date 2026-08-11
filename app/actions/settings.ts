"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * FR-22: 知らない人からのDM受信設定のオン/オフ。
 * Phase 7で専用の設定画面（/settings）に統合済み（NotificationSettingsForm）。
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

  revalidatePath("/settings");
  return { success: true };
}

/**
 * FR-24: プッシュ通知オン/オフ。
 * 今回はDB保存のトグルのみ実装し、実際の配信（Service Worker経由の購読管理・
 * VAPID鍵・送信トリガー）は将来対応とする（CLAUDE.md Phase 7参照）。
 */
export async function updatePushNotificationsEnabled(
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
    .update({ push_notifications_enabled: enabled })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "設定の更新に失敗しました。" };
  }

  revalidatePath("/settings");
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

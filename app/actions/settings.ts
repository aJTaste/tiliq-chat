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
 * Phase 26: プロフィール編集（表示名・アバター画像）。`profiles.avatar_url`列は
 * Phase 1から存在するが編集UIが無かった（バックログ由来）。username（ユーザーID）は
 * 一意制約付きのID的な扱いのため対象外とし、display_name/avatar_urlのみ更新する。
 * profiles_update_ownのRLS（id = auth.uid()）は判定条件そのものへの影響が無い単純な
 * 自己更新のため、docs/lessons.mdの分岐に従い専用RPCは不要（素のUPDATEで足りる）。
 */
export async function updateProfile(input: {
  displayName: string;
  avatarUrl: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 30) {
    return { success: false, error: "表示名は1〜30文字で入力してください。" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, avatar_url: input.avatarUrl })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: "プロフィールの更新に失敗しました。" };
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

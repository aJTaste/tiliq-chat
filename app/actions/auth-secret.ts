"use server";

import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 既存auth.tsの"use server"ファイルと名前が衝突しないよう別ファイルに分離
// （このファイルはFR-19/FR-20/3.8の「追加認証（PIN/キー）」専用）

const PIN_REGEX = /^[0-9]{4,8}$/;
const BCRYPT_SALT_ROUNDS = 10;

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

export type VerifyResult =
  | { success: true }
  | { success: false; error: string; locked?: boolean };

/**
 * FR-19: 追加認証（PIN／キー）を設定・変更する。
 * ハッシュ化はここ（Server Action, bcryptjs）で行い、user_settings.auth_secretには
 * ハッシュのみを保存する。設定・変更時はロック状態もリセットする。
 */
export async function setAuthSecret(
  type: "pin" | "key",
  value: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  if (type === "pin") {
    if (!PIN_REGEX.test(value)) {
      return {
        success: false,
        error: "認証PINは4〜8桁の数字で入力してください。",
      };
    }
  } else if (value.length === 0) {
    return { success: false, error: "認証キーを入力してください。" };
  }

  const hash = await bcrypt.hash(value, BCRYPT_SALT_ROUNDS);

  const { error } = await supabase
    .from("user_settings")
    .update({
      auth_type: type,
      auth_secret: hash,
      auth_failed_attempts: 0,
      auth_locked_until: null,
    })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "追加認証の設定に失敗しました。" };
  }

  return { success: true };
}

/**
 * 追加認証を未設定に戻す（3.8「後から変更・解除も可能」）。
 */
export async function clearAuthSecret(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({
      auth_type: null,
      auth_secret: null,
      auth_failed_attempts: 0,
      auth_locked_until: null,
    })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "追加認証の解除に失敗しました。" };
  }

  return { success: true };
}

/**
 * 起動時・各チャット・非表示一覧のいずれかで入力されたPIN／キーを検証する。
 * 未設定の場合は3.8「認証が未設定の場合は認証なしでアクセスできる」に従い常に成功扱い。
 */
export async function verifyAuthSecret(value: string): Promise<VerifyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("auth_secret, auth_locked_until")
    .eq("user_id", user.id)
    .single();

  if (!settings?.auth_secret) {
    return { success: true };
  }

  if (
    settings.auth_locked_until &&
    new Date(settings.auth_locked_until) > new Date()
  ) {
    return {
      success: false,
      error:
        "連続失敗によりロック中です。しばらくお待ちいただくか、パスワードで解除してください。",
      locked: true,
    };
  }

  const matches = await bcrypt.compare(value, settings.auth_secret);

  await supabase.rpc("record_auth_attempt", { p_success: matches });

  if (!matches) {
    return { success: false, error: "PIN／キーが正しくありません。" };
  }

  return { success: true };
}

/**
 * 5回連続失敗によるロックを、アカウントのパスワードで解除する
 * （3.8「ロック解除方法は実装時に決定」への対応。既存ログインセッションは維持したまま、
 * 別クライアントインスタンスでパスワードのみを検証する。失敗回数の閾値自体は
 * record_auth_attempt RPC側で判定している）。
 */
export async function unlockAuthWithPassword(
  password: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { success: false, error: "ログインが必要です。" };
  }

  const admin = createAdminClient();
  const { error: verifyError } = await admin.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (verifyError) {
    return { success: false, error: "パスワードが正しくありません。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ auth_failed_attempts: 0, auth_locked_until: null })
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "ロック解除に失敗しました。" };
  }

  return { success: true };
}

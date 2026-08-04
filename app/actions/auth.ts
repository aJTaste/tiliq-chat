"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERNAL_EMAIL_DOMAIN = "tiliqua.app";
const USERNAME_REGEX = /^[A-Za-z0-9]{3,20}$/;

export type AuthFormState = { error?: string } | undefined;

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const realEmail = String(formData.get("email") ?? "").trim();

  if (!USERNAME_REGEX.test(username)) {
    return { error: "ユーザーIDは英数字3〜20文字で入力してください。" };
  }
  if (displayName.length < 1 || displayName.length > 30) {
    return { error: "表示名は1〜30文字で入力してください。" };
  }
  // SRSに具体的な複雑さ要件の記載が無いため、最低限の桁数のみ指定（要件次第で調整可）
  if (password.length < 8) {
    return { error: "パスワードは8文字以上で入力してください。" };
  }

  const admin = createAdminClient();

  // profilesはRLSで`to authenticated`のみ許可されており、未認証状態では読めないため
  // 重複チェックはadminクライアント（service_role）で行う
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return { error: "そのユーザーIDは既に使用されています。" };
  }

  const internalEmail = `${username}@${INTERNAL_EMAIL_DOMAIN}`;

  const { error: createError } = await admin.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true, // MXレコード検証をバイパス
    user_metadata: {
      username,
      display_name: displayName,
      avatar_url: null, // アバターはPhase 4（Cloudinary連携）で対応
      real_email: realEmail || null,
    },
  });

  if (createError) {
    return {
      error: "アカウント作成に失敗しました。時間をおいて再度お試しください。",
    };
  }

  // handle_new_userトリガーでprofiles/user_settingsが作成された直後にログインさせる
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password,
  });

  if (signInError) {
    redirect("/login");
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return {
      error: "ユーザーIDまたはメールアドレスとパスワードを入力してください。",
    };
  }

  let internalEmail: string;

  if (identifier.includes("@")) {
    // 実メールアドレスでのログイン：user_settingsからusernameを逆引き
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("user_id")
      .eq("email", identifier)
      .maybeSingle();

    const profile = settings
      ? (
          await admin
            .from("profiles")
            .select("username")
            .eq("id", settings.user_id)
            .maybeSingle()
        ).data
      : null;

    if (!profile) {
      return { error: "ユーザーIDまたはパスワードが正しくありません。" };
    }

    internalEmail = `${profile.username}@${INTERNAL_EMAIL_DOMAIN}`;
  } else {
    internalEmail = `${identifier}@${INTERNAL_EMAIL_DOMAIN}`;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password,
  });

  if (error) {
    return { error: "ユーザーIDまたはパスワードが正しくありません。" };
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

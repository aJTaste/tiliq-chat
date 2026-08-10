"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StartDmState = { error?: string } | undefined;

function mapDmError(message: string): string {
  if (message.includes("does not accept DMs from strangers")) {
    return "相手はストレンジャーからのDMを許可していません。";
  }
  if (message.includes("blocked")) {
    return "ブロック関係にあるためDMを開始できません。";
  }
  return "DMの開始に失敗しました。時間をおいて再度お試しください。";
}

/** ユーザーID（username）を入力してDMを開始する。フォーム経由で使用。 */
export async function startDirectMessage(
  _prevState: StartDmState,
  formData: FormData,
): Promise<StartDmState> {
  const username = String(formData.get("username") ?? "").trim();

  if (!username) {
    return { error: "ユーザーIDを入力してください。" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (myProfile?.username === username) {
    return { error: "自分自身とはDMを開始できません。" };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!target) {
    return { error: "そのユーザーIDのユーザーが見つかりません。" };
  }

  const { data: roomId, error: rpcError } = await supabase.rpc(
    "get_or_create_dm_room",
    { p_other_user_id: target.id },
  );

  if (rpcError || !roomId) {
    return {
      error: rpcError
        ? mapDmError(rpcError.message)
        : "DMの開始に失敗しました。時間をおいて再度お試しください。",
    };
  }

  redirect(`/chat/${roomId}`);
}

/**
 * ユーザーID（uuid）を直接指定してDMを開始する。
 * 検索結果・フレンド一覧など、既にuser_idが分かっているUIから呼び出す想定（Phase 5〜）。
 */
export async function startDirectMessageWithUser(
  targetUserId: string,
): Promise<StartDmState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (user.id === targetUserId) {
    return { error: "自分自身とはDMを開始できません。" };
  }

  const { data: roomId, error: rpcError } = await supabase.rpc(
    "get_or_create_dm_room",
    { p_other_user_id: targetUserId },
  );

  if (rpcError || !roomId) {
    return {
      error: rpcError
        ? mapDmError(rpcError.message)
        : "DMの開始に失敗しました。時間をおいて再度お試しください。",
    };
  }

  redirect(`/chat/${roomId}`);
}

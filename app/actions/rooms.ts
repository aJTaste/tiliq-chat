"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StartDmState = { error?: string } | undefined;

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

  // 自分自身とのDMは不可（RPC側でもチェックしているが、早めにエラーメッセージを返すため）
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
      error: "DMの開始に失敗しました。時間をおいて再度お試しください。",
    };
  }

  redirect(`/chat/${roomId}`);
}

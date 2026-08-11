"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StartDmState = { error?: string } | undefined;

export type ActionResult =
  | { success: true }
  | { success: false; error: string };

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
 * FR-20「各チャット」スコープ：このチャットに自分の追加認証を要求するかのトグル。
 * set_room_auth_required RPCで自分自身のroom_members行のauth_requiredのみ更新する
 * （room_members_update_ownerのRLSはowner限定のため、専用RPC経由にしている）。
 */
export async function toggleRoomAuthRequired(
  roomId: string,
  required: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.rpc("set_room_auth_required", {
    p_room_id: roomId,
    p_required: required,
  });

  if (error) {
    return { success: false, error: "チャットの鍵設定に失敗しました。" };
  }

  revalidatePath(`/chat/${roomId}`);
  return { success: true };
}

/**
 * FR-10/3.7: 一時チャットを自分の意思で閉じる（両者が閉じると削除バッチの対象になる）。
 */
export async function closeTempChat(roomId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase.from("temp_chat_sessions").upsert(
    {
      room_id: roomId,
      user_id: user.id,
      closed_at: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );

  if (error) {
    return { success: false, error: "チャットを閉じる操作に失敗しました。" };
  }

  revalidatePath("/home");
  return { success: true };
}

export type TempDmDurationOption = "10m" | "1h" | "24h" | "7d" | "custom";

const DURATION_MS: Record<Exclude<TempDmDurationOption, "custom">, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const CUSTOM_UNIT_MS: Record<"minutes" | "hours" | "days", number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

const MAX_CUSTOM_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * FR-10/3.7: 有効期限付きの一時チャットを新規作成する（既存DMを一時チャット化する機能は
 * SRSに明記が無いため対象外。常に新規roomを作るcreate_temp_dm_room RPCを使う）。
 */
export async function startTemporaryDirectMessage(
  targetUserId: string,
  durationOption: TempDmDurationOption,
  customValue?: { amount: number; unit: "minutes" | "hours" | "days" },
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

  let durationMs: number;

  if (durationOption === "custom") {
    if (
      !customValue ||
      !Number.isFinite(customValue.amount) ||
      customValue.amount <= 0
    ) {
      return { error: "有効期限を正しく入力してください。" };
    }
    durationMs = customValue.amount * CUSTOM_UNIT_MS[customValue.unit];
    if (durationMs > MAX_CUSTOM_DURATION_MS) {
      return { error: "有効期限は最大90日までです。" };
    }
  } else {
    durationMs = DURATION_MS[durationOption];
  }

  const expiresAt = new Date(Date.now() + durationMs).toISOString();

  const { data: roomId, error: rpcError } = await supabase.rpc(
    "create_temp_dm_room",
    { p_other_user_id: targetUserId, p_expires_at: expiresAt },
  );

  if (rpcError || !roomId) {
    return {
      error: rpcError
        ? mapDmError(rpcError.message)
        : "一時チャットの開始に失敗しました。時間をおいて再度お試しください。",
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

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

// Phase 19: グループチャットUI M1。create_group_room RPCが投げるraise exceptionの
// メッセージをmapDmErrorと同じsubstringマッチング方式で日本語化する。
function mapGroupError(message: string): string {
  if (message.includes("at least 2 other members")) {
    return "グループには自分以外に2人以上のメンバーが必要です。";
  }
  if (message.includes("group size limit exceeded")) {
    return "グループの人数上限を超えています。";
  }
  if (message.includes("member not found")) {
    return "選択したメンバーが見つかりませんでした。";
  }
  if (message.includes("blocked")) {
    return "ブロック関係にあるメンバーが含まれているため作成できません。";
  }
  if (message.includes("group name too long")) {
    return "グループ名は50文字以内で入力してください。";
  }
  return "グループの作成に失敗しました。時間をおいて再度お試しください。";
}

// Phase 21: グループチャットメンバー管理M2。add_group_members RPCのエラーメッセージを
// 日本語化する。mapGroupErrorを使い回さず独立させた理由：mapGroupErrorの「ブロック」
// 「汎用フォールバック」文言は「作成できません」というcreateGroupRoom専用の言い回しに
// なっており、メンバー追加の文脈で使うと不自然になるため。
function mapAddMembersError(message: string): string {
  if (message.includes("not the group owner")) {
    return "この操作はグループのオーナーのみ行えます。";
  }
  if (message.includes("group size limit exceeded")) {
    return "グループの人数上限を超えています。";
  }
  if (message.includes("member not found")) {
    return "選択したメンバーが見つかりませんでした。";
  }
  if (message.includes("blocked")) {
    return "ブロック関係にあるメンバーが含まれているため追加できません。";
  }
  if (message.includes("no new members to add")) {
    return "追加できる新しいメンバーがいません。";
  }
  return "メンバーの追加に失敗しました。時間をおいて再度お試しください。";
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

/**
 * Phase 19: グループチャットUI M1。検索・複数選択したメンバーIDでグループルームを新規作成する。
 * 自分自身の除外・重複除去はここでも行うが（create_group_room RPCも同様のチェックを持つ多層防御）、
 * 「2人未満」はここで早期returnすることでRPC呼び出し自体を省略できる。
 */
export async function createGroupRoom(
  memberIds: string[],
  name?: string,
): Promise<StartDmState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const uniqueOthers = Array.from(new Set(memberIds)).filter(
    (id) => id !== user.id,
  );

  if (uniqueOthers.length < 2) {
    return { error: "グループには自分以外に2人以上のメンバーが必要です。" };
  }

  const { data: roomId, error: rpcError } = await supabase.rpc(
    "create_group_room",
    {
      p_member_ids: uniqueOthers,
      p_name: name?.trim() ? name.trim() : undefined,
    },
  );

  if (rpcError || !roomId) {
    return {
      error: rpcError
        ? mapGroupError(rpcError.message)
        : "グループの作成に失敗しました。時間をおいて再度お試しください。",
    };
  }

  redirect(`/chat/${roomId}`);
}

/**
 * Phase 21: グループチャットメンバー管理M2。オーナーが既存グループへメンバーを追加する。
 * createGroupRoomと異なりredirect()しない（同じチャット画面に留まるため）。
 * components/chat/GroupMembersPanel.tsxから呼ばれ、成功時は呼び出し元がローカルな
 * members状態を楽観的に更新する（GatedChatRoomLoader経由のグループではrouter.refresh()が
 * 効かない＝サーバー側のpeer propが更新されないため、ローカルstate更新方式に一本化した）。
 */
export async function addGroupMembers(
  roomId: string,
  memberIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const uniqueIds = Array.from(new Set(memberIds)).filter(
    (id) => id !== user.id,
  );

  if (uniqueIds.length === 0) {
    return { success: false, error: "追加するメンバーを選択してください。" };
  }

  const { error } = await supabase.rpc("add_group_members", {
    p_room_id: roomId,
    p_member_ids: uniqueIds,
  });

  if (error) {
    return { success: false, error: mapAddMembersError(error.message) };
  }

  revalidatePath(`/chat/${roomId}`);
  return { success: true };
}

/**
 * Phase 21: オーナーが非オーナーメンバーを削除する。room_members_delete_self_or_ownerの
 * RLSが実際のセキュリティ境界（user_id=自分 or 自分がowner）であり、ここでのロール
 * チェックは分かりやすい日本語エラーを早期に返すための多層防御に過ぎない（RPC不要。
 * 単一行DELETEに複数行アトミック性の要件が無いため）。
 */
export async function removeGroupMember(
  roomId: string,
  targetUserId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  if (targetUserId === user.id) {
    return {
      success: false,
      error: "自分自身を削除することはできません。退出機能を使ってください。",
    };
  }

  const { data: myRow } = await supabase
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (myRow?.role !== "owner") {
    return {
      success: false,
      error: "この操作はグループのオーナーのみ行えます。",
    };
  }

  const { data: targetRow } = await supabase
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetRow?.role === "owner") {
    // 理論上到達しない（オーナーは1人のみ）が念のための防御チェック
    return {
      success: false,
      error: "オーナーを削除することはできません。",
    };
  }

  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", targetUserId);

  if (error) {
    return { success: false, error: "メンバーの削除に失敗しました。" };
  }

  revalidatePath(`/chat/${roomId}`);
  return { success: true };
}

/**
 * Phase 21: 非オーナーメンバーが自らグループを退出する。オーナーの退出はM2スコープ外
 * （UIでボタン自体を隠すが、ここでも多層防御として弾く）。成功後は自分がこのroomの
 * is_room_memberでなくなりRLS上ルームが見えなくなるため、呼び出し元
 * （ChatRoomOptionsMenu.tsxのhandleCloseTempChatと同じパターン）でrouter.push("/home")する。
 */
export async function leaveGroup(roomId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data: myRow } = await supabase
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myRow) {
    return { success: false, error: "このグループのメンバーではありません。" };
  }

  if (myRow.role === "owner") {
    return {
      success: false,
      error: "オーナーはグループから退出できません。",
    };
  }

  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "グループの退出に失敗しました。" };
  }

  revalidatePath(`/chat/${roomId}`);
  revalidatePath("/home");
  return { success: true };
}

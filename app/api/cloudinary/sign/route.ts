import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCloudinarySignature } from "@/lib/cloudinary/sign";

/**
 * 画像アップロード用のCloudinary署名を発行する。
 * CLOUDINARY_API_SECRETを扱う特権操作のため、既存原則どおりRoute Handlerに置く
 * （ホットパスであるメッセージ送受信そのものはSupabaseクライアント直接呼び出しのまま）。
 *
 * ファイル本体はここを経由せず、ブラウザからCloudinaryへ直接アップロードする。
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    roomId?: unknown;
  } | null;
  const roomId = typeof body?.roomId === "string" ? body.roomId : null;

  if (!roomId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "roomIdが必要です。" } },
      { status: 422 },
    );
  }

  // フォルダ分け（tiliqua/rooms/{roomId}）の正当性のための多層防御。
  // 実際のメッセージ挿入自体はDB側RLS（messages_insert_member_not_blocked）で別途保護される。
  const { data: isMember, error: memberError } = await supabase.rpc(
    "is_room_member",
    { p_room_id: roomId },
  );

  if (memberError || !isMember) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "このルームへの画像送信権限がありません。",
        },
      },
      { status: 403 },
    );
  }

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "画像アップロード機能が現在利用できません。",
        },
      },
      { status: 503 },
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `tiliqua/rooms/${roomId}`;

  // 署名の対象はCloudinaryへ送るパラメータのうち folder/timestamp のみ
  // （api_key・fileは署名対象外。Cloudinary公式仕様に準拠）
  const signature = createCloudinarySignature({ folder, timestamp }, apiSecret);

  return NextResponse.json({ cloudName, apiKey, timestamp, signature, folder });
}

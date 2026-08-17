import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCloudinarySignature } from "@/lib/cloudinary/sign";

/**
 * Phase 26: ユーザー自身のプロフィールアバター画像アップロード用のCloudinary署名を発行する。
 * `app/api/cloudinary/sign/route.ts`（チャット内画像・グループアバター用）と役割を分けた
 * 専用ルート。既存ルートはfolderをroomId（`tiliqua/rooms/{roomId}`）から導出しており
 * is_room_memberでの検証が前提になっているが、プロフィールアバターにはroomIdが存在しない
 * （folderは`tiliqua/avatars/{userId}`）ため、ログイン済みであること以外の追加検証は不要
 * （更新先はprofiles.avatar_urlのみで、そちらはprofiles_update_ownのRLS(id = auth.uid())で
 * 別途保護される）。
 */
export async function POST() {
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
  const folder = `tiliqua/avatars/${user.id}`;

  const signature = createCloudinarySignature({ folder, timestamp }, apiSecret);

  return NextResponse.json({ cloudName, apiKey, timestamp, signature, folder });
}

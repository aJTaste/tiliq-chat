export class ImageUploadError extends Error {}

type SignResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
};

type SignErrorBody = {
  error?: { code?: string; message?: string };
};

async function fetchUploadSignature(roomId: string): Promise<SignResponse> {
  const res = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as SignErrorBody | null;
    throw new ImageUploadError(
      body?.error?.message ?? "画像アップロードの準備に失敗しました。",
    );
  }

  return res.json() as Promise<SignResponse>;
}

/**
 * 画像をCloudinaryへ直接（Route Handlerを経由せず）署名付きでアップロードする。
 *
 * Route Handlerでファイル本体を中継しないのは意図的な設計：
 *   - Vercelのサーバーレス関数にバイナリを通すとリクエストボディの上限や
 *     実行時間の制約に引っかかりやすく、無料プラン運用（SRS 2.5）と相性が悪い
 *   - Route Handlerは「認証・特権操作専用」の原則どおり、
 *     ここではCLOUDINARY_API_SECRETを使う署名生成だけを担当させる
 * アップロード自体はブラウザ→Cloudinaryへ直接行う（Cloudinary公式の署名付きアップロード方式）。
 */
export async function uploadImageToCloudinary(
  blob: Blob,
  filename: string,
  roomId: string,
): Promise<string> {
  const { cloudName, apiKey, timestamp, signature, folder } =
    await fetchUploadSignature(roomId);

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData },
  );

  if (!uploadRes.ok) {
    throw new ImageUploadError("画像のアップロードに失敗しました。");
  }

  const data = (await uploadRes.json()) as { secure_url?: unknown };

  if (typeof data.secure_url !== "string") {
    throw new ImageUploadError("画像のアップロードに失敗しました。");
  }

  return data.secure_url;
}

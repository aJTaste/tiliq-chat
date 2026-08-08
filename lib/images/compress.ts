// SRS 3.5「画像データ」/ FR-7 準拠：上限5MB・対応フォーマットJPEG/PNG/WebP/GIF
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// 低スペック端末・3G回線を想定した軽量化のためのリサイズ上限（長辺px）と再圧縮品質
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export class ImageValidationError extends Error {}

export function validateImageFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageValidationError(
      "対応していない画像形式です（JPEG / PNG / WebP / GIFのみ）。",
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageValidationError(
      "画像は5MB以下のファイルを選択してください。",
    );
  }
}

/**
 * 画像をリサイズ・再圧縮してBlobとして返す。
 *
 * GIFはcanvas経由で再エンコードするとアニメーションが失われ1コマの静止画になってしまうため、
 * 圧縮せず元ファイルをそのままアップロードする（サイズ上限は事前のvalidateImageFileで担保済み）。
 * createImageBitmap未対応の古い環境でも、そのまま元ファイルにフォールバックする。
 */
export async function compressImage(file: File): Promise<Blob> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    // PNGは透過を保持するためPNGのまま、それ以外はJPEGへ寄せてサイズを抑える
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, JPEG_QUALITY);
    });

    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

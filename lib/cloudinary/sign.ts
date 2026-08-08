import crypto from "node:crypto";

/**
 * Cloudinaryの署名付きアップロード用シグネチャを生成する。
 * サーバー側（Route Handler）専用。CLOUDINARY_API_SECRETを使うため
 * 絶対にクライアントへ露出させないこと。
 *
 * アルゴリズムはCloudinary公式仕様：
 *   1. 署名対象パラメータをキー名の昇順でソート
 *   2. "key=value" を "&" で連結
 *   3. 末尾に api_secret を連結してSHA1ハッシュ（16進文字列）
 * https://cloudinary.com/documentation/authentication_signatures
 */
export function createCloudinarySignature(
  paramsToSign: Record<string, string | number>,
  apiSecret: string,
): string {
  const sorted = Object.keys(paramsToSign)
    .sort()
    .map((key) => `${key}=${paramsToSign[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(sorted + apiSecret)
    .digest("hex");
}

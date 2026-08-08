/**
 * Cloudinaryのsecure_urlに配信用の変換パラメータを差し込む。
 *
 * next/image（Vercelの画像最適化API）は使わない方針にした：
 * Cloudinary側で既に f_auto（形式自動選択）/ q_auto（画質自動）による最適化ができるため、
 * next/imageを併用すると同じ画像を二重に変換することになり、
 * Vercel無料プランの画像最適化回数（月間上限あり）を無駄に消費してしまう。
 * そのため配信は素の<img>のまま、CloudinaryのURLベース変換だけで軽量化する。
 *
 * 変換パラメータは "/upload/" の直後に挿入する（Cloudinary URLの標準的な変換構文）。
 * 例: https://res.cloudinary.com/xxx/image/upload/v123/tiliqua/rooms/abc/def.jpg
 *  → https://res.cloudinary.com/xxx/image/upload/f_auto,q_auto,w_640/v123/tiliqua/rooms/abc/def.jpg
 */
export function buildChatImageUrl(secureUrl: string, width = 640): string {
  const marker = "/upload/";
  const markerIndex = secureUrl.indexOf(marker);

  // Cloudinary以外のURL形式や想定外の形の場合は変換を諦め、元のURLをそのまま返す
  if (markerIndex === -1) return secureUrl;

  const insertAt = markerIndex + marker.length;

  // アニメーションGIF対策：Cloudinaryは変換をかけたアニメーション画像に対して、
  // fl_animated を付けない限りデフォルトで先頭フレームのみを配信する。
  // GIFは先頭フレームが空白/透明なことが多く、それが「画像が表示されない」ように見える原因だった。
  // f_auto と fl_animated を併用することで、対応ブラウザにはアニメーションWebPとして
  // （非対応ならGIFのまま）アニメーションを保った状態で配信される。
  const isGif = /\.gif(\?|$)/i.test(secureUrl);
  const transformation = isGif
    ? `f_auto,fl_animated,q_auto,w_${width}`
    : `f_auto,q_auto,w_${width}`;

  return (
    secureUrl.slice(0, insertAt) +
    `${transformation}/` +
    secureUrl.slice(insertAt)
  );
}

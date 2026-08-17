"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { updateProfile } from "@/app/actions/settings";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import {
  compressImage,
  validateImageFile,
  ImageValidationError,
} from "@/lib/images/compress";
import { uploadAvatarToCloudinary, ImageUploadError } from "@/lib/cloudinary/upload";

const DISPLAY_NAME_MAX_LENGTH = 30;

/**
 * Phase 26: プロフィール編集（表示名・アバター画像）。バックログ「ユーザーごとの
 * プロフィール・アイコン編集の概念が欲しい」に対応。ユーザーID（username）は一意制約付きの
 * ID的な扱いのため変更不可（読み取り専用表示のみ）とし、表示名とアバターのみ編集対象とする。
 *
 * アバターの「選択直後はアップロードせずプレビューのみ、保存ボタン押下時に初めて
 * compressImage→uploadAvatarToCloudinaryする」ステージング方式は
 * `components/chat/GroupMembersPanel.tsx`（グループアバター編集）と同じパターンを踏襲。
 * 画像削除（アバターを未設定に戻す）はremoveAvatarフラグで管理し、新規選択で自動的に解除する。
 */
export function ProfileSettingsForm({
  username,
  initialDisplayName,
  initialAvatarUrl,
}: {
  username: string;
  initialDisplayName: string;
  initialAvatarUrl: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(
    null,
  );
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearStagedFile() {
    setStagedFile(null);
    setStagedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    try {
      validateImageFile(file);
    } catch (err) {
      setError(
        err instanceof ImageValidationError
          ? err.message
          : "画像を選択できませんでした。",
      );
      return;
    }

    setError(null);
    setMessage(null);
    clearStagedFile();
    setRemoveAvatar(false);
    setStagedFile(file);
    setStagedPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveAvatar() {
    setError(null);
    setMessage(null);
    clearStagedFile();
    setRemoveAvatar(true);
  }

  function handleSave() {
    if (saving) return;
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      setError("表示名は1〜30文字で入力してください。");
      return;
    }

    setError(null);
    setMessage(null);
    setSaving(true);
    void (async () => {
      try {
        let nextAvatarUrl = avatarUrl;
        if (stagedFile) {
          const compressed = await compressImage(stagedFile);
          nextAvatarUrl = await uploadAvatarToCloudinary(
            compressed,
            stagedFile.name,
          );
        } else if (removeAvatar) {
          nextAvatarUrl = null;
        }

        const result = await updateProfile({
          displayName: trimmed,
          avatarUrl: nextAvatarUrl,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }

        setDisplayName(trimmed);
        setAvatarUrl(nextAvatarUrl);
        clearStagedFile();
        setRemoveAvatar(false);
        setMessage("プロフィールを更新しました。");
      } catch (err) {
        setError(
          err instanceof ImageValidationError || err instanceof ImageUploadError
            ? err.message
            : NETWORK_ERROR_MESSAGE,
        );
      } finally {
        setSaving(false);
      }
    })();
  }

  const displayAvatarUrl = stagedPreviewUrl ?? (removeAvatar ? null : avatarUrl);
  const dirty =
    stagedFile !== null ||
    removeAvatar ||
    displayName.trim() !== initialDisplayName;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
      <div>
        <h2 className="font-medium text-ink">プロフィール</h2>
        <p className="mt-1 text-xs text-ink-muted">
          ユーザーID：@{username}（変更不可）
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-band/60 font-label text-lg text-ink-muted">
          {displayAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- CloudinaryのURLをそのまま表示する。next/imageは不採用（docs/lessons.md参照）。
            <img
              src={displayAvatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            displayName.trim().slice(0, 1) || "U"
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-left text-xs text-tongue"
          >
            画像を変更
          </button>
          {displayAvatarUrl && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="text-left text-xs text-ink-muted"
            >
              画像を削除
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            aria-label="アバター画像を選択"
            className="hidden"
          />
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        表示名
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          className="rounded-lg border border-band bg-surface px-3 py-2 text-ink outline-none focus-visible:border-tongue"
        />
      </label>

      <div className="flex">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg bg-tongue px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>

      {message && <p className="text-xs text-tongue">{message}</p>}
      {error && (
        <p className="text-xs text-clay" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

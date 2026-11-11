"use client";

import { useState, useTransition } from "react";
import { PortalIcon } from "@/app/components/PortalUI";
import { updateMyAvatar, updateMyProfile, type EditableProfile } from "./actions";

type Props = { profile: EditableProfile };

const errorMessages: Record<string, string> = {
  DISPLAY_NAME_TOO_LONG: "Display name must be 100 characters or fewer.",
  USERNAME_FORMAT_INVALID: "Username must be 3–40 characters and use only letters, numbers, or underscores.",
  USERNAME_EXISTS: "That username is already in use. Try another one.",
  AVATAR_MUST_BE_HTTPS_URL: "Avatar must be a valid HTTPS image URL (or leave it blank).",
  LOCALE_INVALID: "Enter a locale like en, en-US, or hi-IN.",
  TIME_ZONE_INVALID: "Enter a valid IANA time zone, such as Asia/Kolkata.",
  AVATAR_STORAGE_NOT_CONFIGURED: "Profile-picture uploads are not configured yet. Add the Cloudinary environment variables.",
  UNSUPPORTED_IMAGE_TYPE: "Choose a JPG, PNG, WebP, or AVIF image.",
  IMAGE_TOO_LARGE: "This image could not be compressed below 5 MB. Try a smaller image.",
  AVATAR_UPLOAD_FAILED: "Cloudinary could not upload this image. Please try again.",
  AUTHENTICATION_REQUIRED: "Your session expired. Sign in again and retry.",
};

export function ProfileEditor({ profile }: Props) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [locale, setLocale] = useState(profile.locale);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState({ displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl, locale: profile.locale, timeZone: profile.timeZone });
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const initials = (displayName || username || profile.email).trim().slice(0, 1).toUpperCase() || "U";
  const dirty = displayName !== saved.displayName || username !== saved.username || avatarUrl !== saved.avatarUrl || locale !== saved.locale || timeZone !== saved.timeZone;

  async function compressAvatarIfNeeded(file: File): Promise<File> {
    const targetBytes = 1.5 * 1024 * 1024;
    if (file.size <= targetBytes) return file;

    // Compress oversized photos in the browser before sending them to the server.
    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 1024;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("IMAGE_COMPRESSION_FAILED");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      // JPEG output is broadly supported; progressively lower quality if needed.
      for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.4]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= targetBytes) {
          const baseName = file.name.replace(/\\.[^.]+$/, "") || "avatar";
          return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
        }
      }
      throw new Error("IMAGE_TOO_LARGE");
    } finally {
      bitmap.close();
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setError("");
    setMessage("");
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(file.type)) {
      setError("Choose a JPG, PNG, WebP, or AVIF image.");
      return;
    }
    if (file.size < 1) {
      setError("Choose a valid image file.");
      return;
    }
    setUploading(true);
    try {
      const originalSize = file.size;
      const uploadFile = await compressAvatarIfNeeded(file);
      if (uploadFile.size > 5 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
      const form = new FormData();
      form.set("file", uploadFile);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        const code = result.error ?? "AVATAR_UPLOAD_FAILED";
        throw new Error(errorMessages[code] ? code : "AVATAR_UPLOAD_FAILED");
      }
      await updateMyAvatar(result.url);
      setAvatarUrl(result.url);
      setAvatarFailed(false);
      setSaved((current) => ({ ...current, avatarUrl: result.url! }));
      const wasCompressed = uploadFile.size < originalSize;
      const sizeLabel = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      setMessage(`${wasCompressed ? `Image compressed from ${sizeLabel(originalSize)} to ${sizeLabel(uploadFile.size)} and uploaded to Cloudinary.` : "Image uploaded to Cloudinary."} Your profile picture has been saved.`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "IMAGE_COMPRESSION_FAILED" ? "This browser could not compress the image. Try another image or browser." : errorMessages[code] ?? "Cloudinary could not upload this image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        await updateMyProfile({ displayName, username, avatarUrl, locale, timeZone });
        const next = { displayName: displayName.trim(), username: username.trim().toLowerCase(), avatarUrl: avatarUrl.trim(), locale: locale.trim(), timeZone: timeZone.trim() };
        setDisplayName(next.displayName);
        setUsername(next.username);
        setAvatarUrl(next.avatarUrl);
        setLocale(next.locale);
        setTimeZone(next.timeZone);
        setSaved(next);
        setMessage("Your profile has been saved.");
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : "";
        setError(errorMessages[code] ?? "We couldn't save your profile. Please try again.");
      }
    });
  }

  return <div className="profile-page-grid">
    <section className="portal-card profile-editor-card">
      <div className="profile-card-heading"><div><p className="portal-eyebrow">YOUR IDENTITY</p><h2>Profile information</h2><p>These details help people and applications recognize your OneAuth account.</p></div><span className="profile-private-label"><PortalIcon name="shield-check" /> Private by default</span></div>
      <div className="profile-preview">
        {avatarUrl && !avatarFailed ? <img className="profile-avatar" src={avatarUrl} alt="Profile avatar preview" onError={() => setAvatarFailed(true)} /> : <span className="profile-avatar profile-avatar-fallback">{initials}</span>}
        <div className="profile-preview-copy"><strong>{displayName || username || "Your name"}</strong><span>{username ? `@${username}` : "Add a username to personalize your profile"}</span><small>{profile.email}</small></div>
        <span className="profile-preview-status"><span /> Active</span>
      </div>
      {message ? <div className="profile-feedback profile-feedback-success" role="status"><PortalIcon name="check-circle" />{message}</div> : null}
      {error ? <div className="profile-feedback profile-feedback-error" role="alert"><PortalIcon name="alert-circle" />{error}</div> : null}
      <form className="profile-form" onSubmit={submit}>
        <div className="profile-form-grid">
          <label className="profile-field"><span>Display name</span><input autoComplete="name" maxLength={100} placeholder="How should we call you?" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><small>Shown in your OneAuth account and supported identity claims.</small></label>
          <label className="profile-field"><span>Username</span><div className="profile-input-prefix"><span>@</span><input autoComplete="username" maxLength={40} placeholder="your_username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} /></div><small>3–40 characters: letters, numbers, and underscores.</small></label>
          <div className="profile-field profile-field-wide"><span>Profile picture <i>Optional</i></span><div className="profile-upload-control"><label className="profile-upload-button"><PortalIcon name="image-plus" />{uploading ? "Compressing / uploading…" : "Upload picture"}<input accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading || pending} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label><span>JPG, PNG, WebP or AVIF · Large images are compressed automatically</span>{avatarUrl ? <button className="profile-remove-avatar" disabled={uploading || pending} onClick={() => { setAvatarUrl(""); setAvatarFailed(false); }} type="button">Remove picture</button> : null}</div><small>Your image is stored in Cloudinary and saved to your OneAuth profile automatically after upload.</small></div>
        </div>
        <div className="profile-section-divider" />
        <div className="profile-card-heading profile-preferences-heading"><div><h2>Regional preferences</h2><p>Choose how OneAuth formats language and time-related information.</p></div></div>
        <div className="profile-form-grid">
          <label className="profile-field"><span>Language / locale</span><select value={locale} onChange={(event) => setLocale(event.target.value)}><option value="en">English (en)</option><option value="en-US">English — United States (en-US)</option><option value="en-GB">English — United Kingdom (en-GB)</option><option value="hi-IN">Hindi — India (hi-IN)</option><option value="mr-IN">Marathi — India (mr-IN)</option><option value="fr-FR">French — France (fr-FR)</option><option value="es-ES">Spanish — Spain (es-ES)</option><option value="de-DE">German — Germany (de-DE)</option><option value="ja-JP">Japanese — Japan (ja-JP)</option></select><small>Preference stored with your identity profile.</small></label>
          <label className="profile-field"><span>Time zone</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{["UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select><small>Used for displaying dates and times.</small></label>
        </div>
        <div className="profile-form-footer"><span>{dirty ? "You have unsaved changes." : "Your profile is up to date."}</span><div><button className="portal-button portal-button-secondary" disabled={!dirty || pending || uploading} onClick={() => { setDisplayName(saved.displayName); setUsername(saved.username); setAvatarUrl(saved.avatarUrl); setLocale(saved.locale); setTimeZone(saved.timeZone); setError(""); setMessage(""); }} type="button">Discard</button><button className="portal-button portal-button-primary" disabled={!dirty || pending || uploading} type="submit">{pending ? "Saving…" : <><PortalIcon name="check-circle" /> Save changes</>}</button></div></div>
      </form>
    </section>
    <aside className="profile-side-column">
      <section className="portal-card profile-side-card"><span className="profile-side-icon"><PortalIcon name="mail" /></span><h3>Email address</h3><p>Your sign-in and recovery email. To change it, use the verified email change flow in account security.</p><div className="profile-email-value"><span>{profile.email}</span>{profile.emailVerified ? <span className="profile-verified"><PortalIcon name="check-circle" /> Verified</span> : <span className="profile-unverified">Unverified</span>}</div><a href="/security">Review account security →</a></section>
      <section className="portal-card profile-side-card"><span className="profile-side-icon"><PortalIcon name="shield-check" /></span><h3>Your data, your choice</h3><p>Profile fields are optional except for your account email. Only share details you are comfortable including in your identity profile.</p><a href="/developer/docs">Learn about identity claims →</a></section>
      <section className="profile-account-meta"><span>ACCOUNT CREATED</span><strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(profile.createdAt))}</strong><span>ACCOUNT IDENTITY</span><strong>{profile.emailVerified ? "Email verified" : "Email verification pending"}</strong></section>
    </aside>
  </div>;
}

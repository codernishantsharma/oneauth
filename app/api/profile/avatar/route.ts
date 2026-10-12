import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function cloudinarySignature(params: Record<string, string>, secret: string) {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(canonical + secret).digest("hex");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "AVATAR_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "INVALID_UPLOAD" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "IMAGE_REQUIRED" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "UNSUPPORTED_IMAGE_TYPE" }, { status: 415 });
  if (file.size < 1 || file.size > MAX_AVATAR_BYTES) return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = { folder: "oneauth/profiles", overwrite: "true", public_id: user.id, timestamp, transformation: "c_fill,g_face,h_512,w_512,q_auto,f_auto" };
  const signature = cloudinarySignature(params, apiSecret);
  const body = new FormData();
  body.set("file", file, file.name || "avatar");
  body.set("api_key", apiKey);
  body.set("timestamp", timestamp);
  body.set("folder", params.folder);
  body.set("public_id", params.public_id);
  body.set("overwrite", params.overwrite);
  body.set("transformation", params.transformation);
  body.set("signature", signature);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: "POST", body, signal: AbortSignal.timeout(30_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== "object" || !("secure_url" in payload) || typeof payload.secure_url !== "string") {
      console.error("Cloudinary avatar upload failed", { status: response.status });
      return NextResponse.json({ error: "AVATAR_UPLOAD_FAILED" }, { status: 502 });
    }
    return NextResponse.json({ url: payload.secure_url });
  } catch {
    return NextResponse.json({ error: "AVATAR_UPLOAD_FAILED" }, { status: 502 });
  }
}

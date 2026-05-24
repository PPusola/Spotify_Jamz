import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@env";

/**
 * Upload a local image (file:// URI) to Cloudinary via unsigned preset.
 * Returns the secure HTTPS URL of the uploaded image.
 *
 * Requires a Cloudinary "unsigned" upload preset — configured in:
 *   Cloudinary dashboard → Settings → Upload → Upload presets → Add upload preset
 * Set Signing Mode = Unsigned. Use that preset name as CLOUDINARY_UPLOAD_PRESET.
 */
export async function uploadProfilePhoto(uid, fileUri) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary not configured — set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in .env"
    );
  }

  const data = new FormData();
  data.append("file", {
    uri: fileUri,
    type: "image/jpeg",
    name: `${Date.now()}.jpg`,
  });
  data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  data.append("folder", `tune-match/${uid}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: data }
  );

  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message ?? "Cloudinary upload failed");
  }
  return json.secure_url;
}

/**
 * Cloudinary deletion requires a signed API call (needs the API secret), which
 * we can't safely make from a mobile client. Removing the URL from the user's
 * record is enough at the app level — the asset stays in Cloudinary unreferenced.
 * Delete from the Cloudinary dashboard if you need to free space.
 */
export async function deleteProfilePhoto(_url) {
  // no-op — soft delete only
}

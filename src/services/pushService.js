import { CUSTOM_TOKEN_URL } from "@env";

/**
 * Fire-and-forget push notification trigger. Posts to the Cloudflare Worker's
 * /notify endpoint, which verifies the caller via their Spotify token, then
 * looks up the recipient's push tokens in RTDB and forwards to Expo Push.
 *
 * Caller passes their own access token so the worker can identify them.
 * Failures are swallowed (we never want a push failure to break sending a
 * message) — they're logged so they show up in Metro for debugging.
 */
export async function sendPush({ spotifyAccessToken, recipientUid, title, body, data }) {
  const url = `${(CUSTOM_TOKEN_URL || "").replace(/\/$/, "")}/notify`;
  console.log("[push] preparing send to", JSON.stringify(url), {
    hasToken: !!spotifyAccessToken,
    recipientUid,
    title,
    bodyLen: body?.length,
  });

  if (!CUSTOM_TOKEN_URL || !spotifyAccessToken || !recipientUid) {
    console.warn("[push] bailed early — missing", {
      CUSTOM_TOKEN_URL: !!CUSTOM_TOKEN_URL,
      spotifyAccessToken: !!spotifyAccessToken,
      recipientUid: !!recipientUid,
    });
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotifyAccessToken,
        recipientUid,
        title,
        body,
        data,
      }),
    });
    console.log("[push] /notify responded", res.status);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[push] /notify failed:", res.status, txt.slice(0, 200));
    } else {
      const txt = await res.text().catch(() => "");
      console.log("[push] /notify body:", txt.slice(0, 200));
    }
  } catch (e) {
    console.warn("[push] /notify error:", e?.message, "URL was:", url);
  }
}

// Cloudflare Worker — two endpoints:
//
//   POST /                Mint a Firebase custom token for a verified Spotify user.
//   POST /notify          Send a push notification to a Firebase user via the
//                         Expo Push API. The sender provides their Spotify
//                         access token; the worker verifies it, reads the
//                         recipient's push tokens from Firebase RTDB (using
//                         OAuth derived from the service account), and forwards
//                         to https://exp.host/--/api/v2/push/send.
//
// Env vars (Wrangler secrets):
//   FIREBASE_SERVICE_ACCOUNT  Stringified service account JSON.
//   FIREBASE_DB_URL           Realtime DB URL (e.g. https://x-default-rtdb.firebaseio.com)

const ALLOWED_ORIGINS = ["*"];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return jsonError(405, "POST only");
    }

    const url = new URL(request.url);
    if (url.pathname === "/notify") {
      return handleNotify(request, env);
    }
    return handleMintToken(request, env);
  },
};

// ─── /  — mint custom Firebase token ─────────────────────────────────────────

async function handleMintToken(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, "Invalid JSON body"); }

  const spotifyAccessToken = body?.spotifyAccessToken;
  if (!spotifyAccessToken || typeof spotifyAccessToken !== "string") {
    return jsonError(400, "spotifyAccessToken is required");
  }

  const me = await verifySpotifyToken(spotifyAccessToken);
  if (!me) return jsonError(401, "Spotify token rejected");
  const uid = `spotify_${me.id}`;

  const serviceAccount = parseServiceAccount(env);
  if (!serviceAccount) return jsonError(500, "Worker secret FIREBASE_SERVICE_ACCOUNT is not valid JSON");

  const firebaseToken = await mintFirebaseCustomToken({
    uid,
    serviceAccount,
    claims: { spotifyId: me.id },
  });
  return jsonOk({ firebaseToken, spotifyId: me.id });
}

// ─── /notify  — send a push notification ─────────────────────────────────────

async function handleNotify(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, "Invalid JSON body"); }

  const { spotifyAccessToken, recipientUid, title, body: msgBody, data } = body || {};
  if (!spotifyAccessToken) return jsonError(400, "spotifyAccessToken required");
  if (!recipientUid)       return jsonError(400, "recipientUid required");
  if (!title && !msgBody)  return jsonError(400, "title or body required");

  // 1. Verify sender so this endpoint can't be abused by random callers
  const me = await verifySpotifyToken(spotifyAccessToken);
  if (!me) return jsonError(401, "Spotify token rejected");

  const serviceAccount = parseServiceAccount(env);
  if (!serviceAccount) return jsonError(500, "Worker secret FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  if (!env.FIREBASE_DB_URL) return jsonError(500, "FIREBASE_DB_URL not configured");

  // 2. Get an OAuth access token for the Firebase DB scope
  const accessToken = await getGoogleAccessToken(serviceAccount, [
    "https://www.googleapis.com/auth/firebase.database",
    "https://www.googleapis.com/auth/userinfo.email",
  ]);
  if (!accessToken) return jsonError(500, "Could not mint Google access token");

  // 3. Read recipient's push tokens from RTDB
  const tokensUrl = `${stripTrailingSlash(env.FIREBASE_DB_URL)}/pushTokens/${encodeURIComponent(recipientUid)}.json?access_token=${encodeURIComponent(accessToken)}`;
  const tokensRes = await fetch(tokensUrl);
  if (!tokensRes.ok) {
    return jsonError(500, `RTDB read failed: ${tokensRes.status}`);
  }
  const tokensJson = await tokensRes.json();
  const tokens = Object.values(tokensJson || {})
    .map((t) => t?.token)
    .filter((s) => typeof s === "string" && s.startsWith("ExponentPushToken"));

  if (tokens.length === 0) {
    return jsonOk({ sent: 0, reason: "no_tokens" });
  }

  // 4. Build payloads and POST to Expo
  const payloads = tokens.map((to) => ({
    to,
    title: title || "TuneMatch",
    body: msgBody || "",
    sound: "default",
    data: data || {},
    priority: "high",
    channelId: "default",
  }));

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payloads),
  });
  const expoBody = await expoRes.json().catch(() => ({}));
  if (!expoRes.ok) {
    return jsonError(502, `Expo push failed: ${expoRes.status} ${JSON.stringify(expoBody).slice(0, 300)}`);
  }
  return jsonOk({ sent: payloads.length, result: expoBody });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function verifySpotifyToken(token) {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const me = await res.json().catch(() => null);
  return me?.id ? me : null;
}

function parseServiceAccount(env) {
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { return null; }
}

function stripTrailingSlash(s) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

// ─── Firebase custom-token JWT (RS256, for /) ────────────────────────────────

async function mintFirebaseCustomToken({ uid, serviceAccount, claims }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims: claims || {},
  };
  return signJwtRS256(header, payload, serviceAccount.private_key);
}

// ─── Google OAuth (service-account → access_token, for /notify) ──────────────

async function getGoogleAccessToken(serviceAccount, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const assertion = await signJwtRS256(header, payload, serviceAccount.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return json?.access_token ?? null;
}

// ─── Generic RS256 JWT signer (shared by both flows) ─────────────────────────

async function signJwtRS256(header, payload, privateKeyPem) {
  const enc = (obj) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = await importPrivateKey(privateKeyPem);
  const sigBuf = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
}

async function importPrivateKey(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64UrlEncode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Response helpers ────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function jsonOk(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

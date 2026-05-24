// Cloudflare Worker — mints Firebase custom tokens for verified Spotify users.
//
// Flow:
//   1. Mobile app POSTs { spotifyAccessToken } to this Worker.
//   2. Worker calls api.spotify.com/v1/me with that token to verify it
//      and read the Spotify user id.
//   3. Worker signs a Firebase custom JWT with the service account private
//      key (stored as a Wrangler secret, never in the client).
//   4. Worker returns { firebaseToken, spotifyId }.
//   5. App calls signInWithCustomToken(firebaseToken) — Firebase Auth UID
//      becomes spotify_<spotifyId>, deterministic across devices.

const ALLOWED_ORIGINS = ["*"]; // tighten in production if you have a web client

export default {
  async fetch(request, env) {
    // CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return jsonError(405, "POST only");
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }
    const spotifyAccessToken = body?.spotifyAccessToken;
    if (!spotifyAccessToken || typeof spotifyAccessToken !== "string") {
      return jsonError(400, "spotifyAccessToken is required");
    }

    // 1. Verify Spotify token + extract user id
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${spotifyAccessToken}` },
    });
    if (!meRes.ok) {
      return jsonError(401, "Spotify token rejected");
    }
    const me = await meRes.json();
    if (!me?.id) {
      return jsonError(500, "Spotify response missing id");
    }
    const spotifyId = String(me.id);
    const uid = `spotify_${spotifyId}`;

    // 2. Load service account from secret
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      return jsonError(500, "Worker secret FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }

    // 3. Mint Firebase custom token (signed JWT, RS256)
    const firebaseToken = await mintFirebaseCustomToken({
      uid,
      serviceAccount,
      claims: { spotifyId },
    });

    return jsonOk({ firebaseToken, spotifyId });
  },
};

// ─── JWT signing ─────────────────────────────────────────────────────────────

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

  const enc = (obj) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const sig = base64UrlEncode(new Uint8Array(sigBuf));
  return `${unsigned}.${sig}`;
}

async function importPrivateKey(pem) {
  // Strip PEM header/footer + newlines and base64-decode the DER bytes.
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

# tunematch-auth Worker

Cloudflare Worker that mints Firebase custom tokens for verified Spotify users.
The mobile app calls this Worker after Spotify OAuth completes; it returns a
Firebase custom token the app uses with `signInWithCustomToken()`.

## One-time setup

### 1. Get a Firebase service account key

1. Open https://console.firebase.google.com/ → your project → ⚙️ Project settings
2. **Service accounts** tab → **Generate new private key** → save the JSON file
3. Treat this file like a password — do **NOT** commit it

### 2. Create a Cloudflare account + install wrangler

- Sign up at https://dash.cloudflare.com/sign-up (free, no card required)
- Install the CLI: `npm install -g wrangler`
- Log in: `wrangler login` (opens a browser)

### 3. Deploy the Worker

From the `worker/` directory:

```bash
cd worker
wrangler deploy
```

First deploy will print your Worker URL, e.g.
`https://tunematch-auth.<your-subdomain>.workers.dev`

### 4. Upload the service account as a secret

```bash
wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

When prompted, paste the **entire contents** of the service account JSON file
on a single line. (On Windows you can `Get-Content key.json | Set-Clipboard`
then paste.) The secret is encrypted and never exposed to clients.

### 5. Tell the app where the Worker lives

Add to your project root `.env`:

```
CUSTOM_TOKEN_URL=https://tunematch-auth.<your-subdomain>.workers.dev
```

Then restart Metro: `npx expo start --clear`

## Local development

```bash
wrangler dev
```

Runs the Worker on `http://localhost:8787`. Point `CUSTOM_TOKEN_URL` there
while testing.

## How it works

1. App sends `POST /` with `{ spotifyAccessToken }`.
2. Worker calls `https://api.spotify.com/v1/me` to verify the token and read
   the Spotify user id.
3. Worker signs a Firebase custom JWT (RS256) using the service account
   private key, with `uid = "spotify_<spotifyId>"`.
4. Worker responds `{ firebaseToken, spotifyId }`.
5. App calls `signInWithCustomToken(firebaseToken)`. The Firebase Auth UID
   is now deterministic per Spotify account — same on every device and reinstall.

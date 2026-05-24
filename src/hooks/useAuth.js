import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { SPOTIFY_CLIENT_ID } from "@env";
import { auth } from "@services/firebase";
import { getMe } from "@services/spotify";

const SPOTIFY_ID_KEY = "@jamz_spotify_id";
const TOKEN_KEY      = "@jamz_spotify_token";
const REFRESH_KEY    = "@jamz_spotify_refresh";
const EXPIRES_KEY    = "@jamz_spotify_expires";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function fetchRefreshedToken(refreshToken) {
  const res = await withTimeout(
    fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
      }).toString(),
    }),
    8000,
    "Spotify token refresh"
  );
  return res.json();
}

async function ensureFirebaseUser() {
  if (auth.currentUser) return auth.currentUser;

  const existingUser = await withTimeout(
    new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        unsubscribe();
        resolve(firebaseUser);
      });
    }),
    5000,
    "Firebase auth state lookup"
  );
  if (existingUser) return existingUser;

  const credential = await withTimeout(
    signInAnonymously(auth),
    8000,
    "Firebase anonymous sign-in"
  );
  return credential.user;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [spotifyToken, setToken]      = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    // Hard safety net — if init somehow gets stuck, never leave the user
    // staring at the loader forever. After 12s, drop them on Login.
    const bailoutTimer = setTimeout(() => {
      console.warn("Auth init bailout — forcing loading=false");
      setLoading(false);
    }, 12000);

    const init = async () => {
      try {
        const [storedSpotifyId, storedToken, storedRefresh, storedExpires] = await Promise.all([
          AsyncStorage.getItem(SPOTIFY_ID_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(REFRESH_KEY),
          AsyncStorage.getItem(EXPIRES_KEY),
        ]);

        // ── Determine an active access token ────────────────────────────
        let activeToken = null;
        if (storedToken && storedExpires) {
          const expiresAt = parseInt(storedExpires, 10);
          const fiveMin   = 5 * 60 * 1000;

          if (Date.now() < expiresAt - fiveMin) {
            activeToken = storedToken;
          } else if (storedRefresh) {
            const data = await fetchRefreshedToken(storedRefresh);
            if (data.access_token) {
              await _persist(data.access_token, data.refresh_token ?? storedRefresh, data.expires_in ?? 3600);
              activeToken = data.access_token;
            }
          }
        }

        // ── Derive UID from the Spotify account when possible ──────────
        // Store the Spotify account id for profile metadata. The database
        // owner id comes from Firebase Auth so security rules can verify it.
        let spotifyId = storedSpotifyId ?? null;
        if (activeToken) {
          try {
            const me = await withTimeout(getMe(activeToken), 5000, "Spotify getMe");
            if (me?.id && me.id !== storedSpotifyId) {
              spotifyId = me.id;
              await AsyncStorage.setItem(SPOTIFY_ID_KEY, spotifyId);
            } else if (me?.id) {
              spotifyId = me.id;
            }
          } catch (e) {
            console.warn("Could not fetch Spotify profile for UID:", e.message);
          }
        }

        if (activeToken) {
          const firebaseUser = await ensureFirebaseUser();
          setUser({ uid: firebaseUser.uid, spotifyId });
          setToken(activeToken);
        }
      } catch (e) {
        console.warn("Auth init error:", e.message);
      } finally {
        clearTimeout(bailoutTimer);
        setLoading(false);
      }
    };

    init();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────

  async function _persist(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + expiresIn * 1000;
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY,   accessToken),
      AsyncStorage.setItem(EXPIRES_KEY, String(expiresAt)),
      refreshToken
        ? AsyncStorage.setItem(REFRESH_KEY, refreshToken)
        : Promise.resolve(),
    ]);
  }

  // Called by LoginScreen after a successful code exchange
  const saveTokens = async ({ access_token, refresh_token, expires_in = 3600 }) => {
    await _persist(access_token, refresh_token, expires_in);
    const firebaseUser = await ensureFirebaseUser();
    let spotifyId = null;

    try {
      const me = await getMe(access_token);
      if (me?.id) {
        spotifyId = me.id;
        await AsyncStorage.setItem(SPOTIFY_ID_KEY, spotifyId);
      }
    } catch (e) {
      console.warn("Could not derive UID from Spotify:", e.message);
    }
    setUser({ uid: firebaseUser.uid, spotifyId });
    setToken(access_token);
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_KEY),
      AsyncStorage.removeItem(EXPIRES_KEY),
    ]);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, spotifyToken, saveTokens, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

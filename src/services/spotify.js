import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { SPOTIFY_CLIENT_ID } from "@env";
import { SPOTIFY_SCOPES } from "@constants";

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

export const redirectUri = AuthSession.makeRedirectUri({
  scheme: "spotifyjamsesh",
  path: "callback",
});

const AUTH_CONFIG = {
  clientId: SPOTIFY_CLIENT_ID,
  scopes: SPOTIFY_SCOPES,
  usePKCE: true,
  redirectUri,
  responseType: AuthSession.ResponseType.Code,
  // Fixed state prevents "state mismatch" in Expo Go when the app remounts
  // on redirect. PKCE (code_verifier) is the actual security mechanism here.
  state: "jamz_auth_state",
  // Force the Spotify login + consent screen every time so a switched user
  // can't be silently re-authed via cached browser cookies.
  extraParams: { show_dialog: "true" },
};

export function useSpotifyAuth() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    AUTH_CONFIG,
    discovery
  );

  return { request, response, promptAsync };
}

// ─── Web API Helpers ──────────────────────────────────────────────────────────

async function spotifyFetch(endpoint, accessToken, options = {}) {
  const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Spotify API error: ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

// ─── Profile APIs ─────────────────────────────────────────────────────────────

/**
 * Get the current user's Spotify profile.
 */
export async function getMe(accessToken) {
  return spotifyFetch("/me", accessToken);
}

/**
 * Get the user's top artists.
 * Returns array of artist name strings.
 */
export async function getTopArtists(accessToken, limit = 10) {
  const data = await spotifyFetch(
    `/me/top/artists?limit=${limit}&time_range=medium_term`,
    accessToken
  );
  return data?.items?.map((a) => a.name) ?? [];
}

/**
 * Get the user's top genres (derived from top artists).
 * Returns array of unique genre strings.
 */
export async function getTopGenres(accessToken, limit = 10) {
  const data = await spotifyFetch(
    `/me/top/artists?limit=${limit}&time_range=medium_term`,
    accessToken
  );
  const genres = data?.items?.flatMap((a) => a.genres) ?? [];
  // Deduplicate and take top 10
  return [...new Set(genres)].slice(0, 10);
}

/**
 * Get the user's top tracks for mixtape generation.
 * Returns lightweight track objects (id, uri, name, artist, album image).
 */
export async function getTopTracks(accessToken, limit = 50) {
  const data = await spotifyFetch(
    `/me/top/tracks?limit=${limit}&time_range=medium_term`,
    accessToken
  );
  return (data?.items ?? []).map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artistName: t.artists?.[0]?.name ?? "",
    artistIds: (t.artists ?? []).map((a) => a.id).filter(Boolean),
    albumImage: t.album?.images?.[t.album.images.length - 1]?.url ?? null,
  }));
}

/**
 * Search tracks for a given genre (used by mixtape Tier 4).
 * Returns the same shape as getTopTracks.
 */
export async function searchTracksByGenre(genre, accessToken, limit = 10) {
  const params = new URLSearchParams({
    q: `genre:"${genre}"`,
    type: "track",
    limit: String(limit),
  });
  const data = await spotifyFetch(`/search?${params}`, accessToken);
  return (data?.tracks?.items ?? []).map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artistName: t.artists?.[0]?.name ?? "",
    artistIds: (t.artists ?? []).map((a) => a.id).filter(Boolean),
    albumImage: t.album?.images?.[t.album.images.length - 1]?.url ?? null,
  }));
}

// ─── Playback APIs ────────────────────────────────────────────────────────────

export async function searchTracks(query, accessToken) {
  const params = new URLSearchParams({ q: query, type: "track" });
  return spotifyFetch(`/search?${params}`, accessToken);
}

export async function getPlaybackState(accessToken) {
  return spotifyFetch("/me/player", accessToken);
}

export async function playTrack(trackUri, positionMs = 0, accessToken) {
  return spotifyFetch("/me/player/play", accessToken, {
    method: "PUT",
    body: JSON.stringify({ uris: [trackUri], position_ms: positionMs }),
  });
}

export async function pausePlayback(accessToken) {
  return spotifyFetch("/me/player/pause", accessToken, { method: "PUT" });
}

export async function seekTo(positionMs, accessToken) {
  return spotifyFetch(
    `/me/player/seek?position_ms=${positionMs}`,
    accessToken,
    { method: "PUT" }
  );
}

// ─── Stats APIs ───────────────────────────────────────────────────────────────

/**
 * Get top artists and tracks for a specific time range.
 * UI passes "4 Weeks", "6 Months", or "All Time".
 */
export async function fetchUserStats(accessToken, timeRange) {
  const rangeMap = {
    "4 Weeks": "short_term",
    "6 Months": "medium_term",
    "All Time": "long_term"
  };
  const spotifyRange = rangeMap[timeRange] || "short_term";

  try {
    const [artistsData, tracksData] = await Promise.all([
      spotifyFetch(`/me/top/artists?time_range=${spotifyRange}&limit=5`, accessToken),
      spotifyFetch(`/me/top/tracks?time_range=${spotifyRange}&limit=5`, accessToken)
    ]);

    return {
      artists: artistsData?.items || [],
      tracks: tracksData?.items || []
    };
  } catch (error) {
    console.error("Error fetching Spotify stats:", error);
    return { artists: [], tracks: [] };
  }
}
export * from "./colors";

// Spotify OAuth scopes — includes top artists/genres for profile
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "playlist-read-private",
  "user-library-read",
  "user-top-read",          // ← needed for top artists/genres
  "user-read-private",      // ← needed for profile info
  "user-read-email",        // ← needed for profile info
  "playlist-modify-private", // ← create private mixtape playlists
  "playlist-modify-public",  // ← in case the user wants a public playlist
];

// How often (ms) clients re-sync position with host to prevent drift
export const SYNC_INTERVAL_MS = 30000;

// Max ms of drift allowed before a hard seek is triggered
export const MAX_DRIFT_MS = 2000;

// Firebase collection/node names
export const DB_ROOMS = "rooms";
export const DB_USERS = "users";

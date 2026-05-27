import { db } from "./firebase";
import {
  ref,
  set,
  get,
  update,
  onValue,
  off,
  remove,
  serverTimestamp,
  query,
  orderByChild,
  startAt,
  endAt,
} from "firebase/database";

const USERS = "users";
const USER_PRIVATE = "userPrivate";
const PUSH_TOKENS = "pushTokens";

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

/**
 * Check if a user profile exists in Firebase.
 */
export async function profileExists(uid) {
  const snapshot = await get(ref(db, `${USERS}/${uid}`));
  return snapshot.exists();
}

/**
 * Create a new user profile.
 */
export async function createProfile(uid, profileData) {
  // Firebase rejects undefined values — clean everything before saving
  const clean = (val) => val ?? null;
  const cleanArray = (arr) => (arr || []).filter((v) => v !== undefined && v !== null);

  await set(ref(db, `${USERS}/${uid}`), {
    ...profileData,
    topGenres: cleanArray(profileData.topGenres),
    topArtists: cleanArray(profileData.topArtists),
    topTracks: cleanArray(profileData.topTracks),
    spotifyDisplayName: clean(profileData.spotifyDisplayName),
    spotifyPfp: clean(profileData.spotifyPfp),
    useSpotifyPhoto: profileData.useSpotifyPhoto ?? true,
    showPhotoInDiscover: profileData.showPhotoInDiscover ?? true,
    followerCount: clean(profileData.followerCount),
    createdAt: Date.now(),
    currentRoom: null,
    currentTrack: null,
    online: true,
  });
}
/**
 * Update an existing profile (partial update).
 */
export async function updateProfile(uid, updates) {
  await update(ref(db, `${USERS}/${uid}`), updates);
}

/**
 * Get a user's profile once.
 */
export async function getProfile(uid) {
  const snapshot = await get(ref(db, `${USERS}/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Subscribe to a user's profile in real time.
 * Returns unsubscribe function.
 */
export function subscribeToProfile(uid, onUpdate) {
  const userRef = ref(db, `${USERS}/${uid}`);
  onValue(userRef, (snapshot) => onUpdate(snapshot.val()));
  return () => off(userRef);
}

/**
 * Set user online/offline status and current room.
 */
export async function setOnlineStatus(uid, online, currentRoom = null) {
  await update(ref(db, `${USERS}/${uid}`), {
    online,
    currentRoom,
    lastSeen: serverTimestamp(),
  });
}

/**
 * Update what track the user is currently listening to.
 */
export async function setCurrentTrack(uid, trackInfo) {
  await update(ref(db, `${USERS}/${uid}`), {
    currentTrack: trackInfo,
  });
}

/**
 * Write the user's live "now playing" snapshot. Stamped with updatedAt so
 * readers can ignore stale data (the user closed the app a while ago).
 */
export async function setNowPlaying(uid, np) {
  if (!uid || !np) return;
  await update(ref(db, `${USERS}/${uid}`), {
    nowPlaying: {
      trackName: np.trackName ?? "",
      artistName: np.artistName ?? "",
      albumArt: np.albumArt ?? null,
      isPlaying: !!np.isPlaying,
      updatedAt: Date.now(),
    },
  });
}

// ─── Private profile (photos + socials) ──────────────────────────────────────

/**
 * Read the current user's private profile (photos, instagram, snapchat).
 * Only readable by the owner per security rules.
 */
export async function getPrivateProfile(uid) {
  const snap = await get(ref(db, `${USER_PRIVATE}/${uid}`));
  return snap.exists() ? snap.val() : { photos: [], instagram: "", snapchat: "" };
}

/**
 * Subscribe to the owner's private profile in real time.
 */
export function subscribeToPrivateProfile(uid, onUpdate) {
  const r = ref(db, `${USER_PRIVATE}/${uid}`);
  onValue(r, (snap) => {
    onUpdate(snap.val() ?? { photos: [], instagram: "", snapchat: "" });
  });
  return () => off(r);
}

/**
 * Replace photo list and/or social handles for the current user.
 * Pass undefined for any field you want to leave unchanged.
 */
export async function updatePrivateProfile(uid, { photos, instagram, snapchat }) {
  const updates = {};
  if (photos !== undefined) {
    updates.photos = (photos || []).filter(
      (u) => typeof u === "string" && u.length > 0 && u.length <= 500
    );
  }
  if (instagram !== undefined) updates.instagram = (instagram || "").slice(0, 50);
  if (snapchat !== undefined) updates.snapchat = (snapchat || "").slice(0, 50);
  await update(ref(db, `${USER_PRIVATE}/${uid}`), updates);
}

// ─── Push notification tokens ────────────────────────────────────────────────

/**
 * Store the device's Expo push token under the user's `pushTokens` map.
 * Keyed by a safe slug of the token itself so repeat saves are idempotent
 * (re-registering on the same device just rewrites the same key).
 */
export async function savePushToken(uid, token) {
  if (!uid || !token) return;
  const key = tokenKey(token);
  await set(ref(db, `${PUSH_TOKENS}/${uid}/${key}`), {
    token,
    updatedAt: Date.now(),
  });
}

export async function removePushToken(uid, token) {
  if (!uid || !token) return;
  await remove(ref(db, `${PUSH_TOKENS}/${uid}/${tokenKey(token)}`));
}

function tokenKey(token) {
  // Firebase keys can't contain . # $ [ ] /  — slug to base36 hash for safety.
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (h * 31 + token.charCodeAt(i)) | 0;
  }
  return `t${(h >>> 0).toString(36)}`;
}

/**
 * Search public users by nickname (simple prefix match).
 * Firebase RTDB doesn't support full-text search so we use
 * orderByChild + startAt + endAt for prefix matching.
 */
export async function searchPublicUsers(nickname) {
  const q = query(
    ref(db, USERS),
    orderByChild("nickname"),
    startAt(nickname),
    endAt(nickname + "\uf8ff")
  );
  const snapshot = await get(q);
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .filter(([, user]) => user.isPublic)
    .map(([uid, user]) => ({ uid, ...user }));
}

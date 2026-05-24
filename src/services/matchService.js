import { db } from "./firebase";
import { ref, set, get, push, onValue, off, update } from "firebase/database";

const LIKES = "likes";
const PASSED = "passed";
const MATCHES = "matches";

function makeMatchId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export async function likeUser(fromUid, toUid, score) {
  await set(ref(db, `${LIKES}/${fromUid}/${toUid}`), true);

  const snap = await get(ref(db, `${LIKES}/${toUid}/${fromUid}`));
  if (snap.val() === true) {
    const mid = makeMatchId(fromUid, toUid);
    const existing = await get(ref(db, `${MATCHES}/${mid}`));
    if (!existing.exists()) {
      const [user1, user2] = [fromUid, toUid].sort();
      await set(ref(db, `${MATCHES}/${mid}`), {
        user1,
        user2,
        score: Math.round(score * 100),
        createdAt: Date.now(),
      });
    }
    return mid;
  }
  return null;
}

export async function passUser(fromUid, toUid) {
  await set(ref(db, `${PASSED}/${fromUid}/${toUid}`), true);
}

export async function getAlreadySeen(uid) {
  const [likesSnap, passedSnap] = await Promise.all([
    get(ref(db, `${LIKES}/${uid}`)),
    get(ref(db, `${PASSED}/${uid}`)),
  ]);
  const liked = likesSnap.val() ? Object.keys(likesSnap.val()) : [];
  const passed = passedSnap.val() ? Object.keys(passedSnap.val()) : [];
  return new Set([...liked, ...passed]);
}

export async function getPublicUsers(excludeUid) {
  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .filter(([uid, u]) => uid !== excludeUid && u.isPublic && u.nickname)
    .map(([uid, u]) => ({ uid, ...u }));
}

export async function getMatches(uid) {
  const snap = await get(ref(db, MATCHES));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .filter(([, m]) => m.user1 === uid || m.user2 === uid)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMatchOtherProfile(matchData, currentUid) {
  const otherUid = matchData.user1 === currentUid ? matchData.user2 : matchData.user1;
  const snap = await get(ref(db, `users/${otherUid}`));
  return snap.exists() ? { uid: otherUid, ...snap.val() } : null;
}

export async function sendMatchMessage(mid, uid, displayName, text, extra = {}) {
  const msgRef = push(ref(db, `${MATCHES}/${mid}/chat`));
  await set(msgRef, { uid, displayName, text, sentAt: Date.now(), ...extra });
}

export async function revealProfile(mid, uid, avatarUrl) {
  await set(ref(db, `${MATCHES}/${mid}/pfpShared/${uid}`), avatarUrl || "none");
}

export function subscribeToMatchPfp(mid, onUpdate) {
  const pfpRef = ref(db, `${MATCHES}/${mid}/pfpShared`);
  onValue(pfpRef, (snap) => onUpdate(snap.val() ?? {}));
  return () => off(pfpRef);
}

/**
 * Share a "comfortable" profile snapshot with a matched user.
 * Writes the user's photos + social handles into matches/$mid/sharedProfile/$uid.
 * The other side of the match only becomes visible to a given user once both
 * sides have shared (UI gates on that).
 */
export async function shareComfortableProfile(mid, uid, { photos, instagram, snapchat }) {
  const payload = {
    sharedAt: Date.now(),
  };
  const cleanPhotos = (photos || []).filter(
    (u) => typeof u === "string" && u.length > 0 && u.length <= 500
  );
  if (cleanPhotos.length > 0) payload.photos = cleanPhotos;
  if (instagram) payload.instagram = String(instagram).slice(0, 50);
  if (snapchat)  payload.snapchat  = String(snapchat).slice(0, 50);

  await set(ref(db, `${MATCHES}/${mid}/sharedProfile/${uid}`), payload);
}

/**
 * Unshare — clears your shared profile from this match.
 */
export async function unshareComfortableProfile(mid, uid) {
  await set(ref(db, `${MATCHES}/${mid}/sharedProfile/${uid}`), null);
}

export function subscribeToSharedProfile(mid, onUpdate) {
  const r = ref(db, `${MATCHES}/${mid}/sharedProfile`);
  onValue(r, (snap) => onUpdate(snap.val() ?? {}));
  return () => off(r);
}

export function subscribeToMatchChat(mid, onUpdate) {
  const chatRef = ref(db, `${MATCHES}/${mid}/chat`);
  onValue(chatRef, (snap) => {
    const val = snap.val();
    if (!val) { onUpdate([]); return; }
    const msgs = Object.entries(val)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.sentAt - b.sentAt);
    onUpdate(msgs);
  });
  return () => off(chatRef);
}

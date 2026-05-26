import { db } from "./firebase";
import { ref, set, get, push, onValue, off, remove } from "firebase/database";

const DMS = "dms";
const USER_DMS = "userDMs";

export function getDmId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export async function getOrCreateDM(myUid, otherUid) {
  const dmId = getDmId(myUid, otherUid);
  const snap = await get(ref(db, `${DMS}/${dmId}/info`));
  if (!snap.exists()) {
    await set(ref(db, `${DMS}/${dmId}/info`), {
      participants: { [myUid]: true, [otherUid]: true },
      createdAt: Date.now(),
    });
  }
  return dmId;
}

export async function sendDM(dmId, myUid, myNickname, myEmoji, otherUid, otherNickname, otherEmoji, text) {
  const now = Date.now();
  const msgRef = push(ref(db, `${DMS}/${dmId}/messages`));
  await set(msgRef, { uid: myUid, displayName: myNickname, text, sentAt: now });

  await Promise.all([
    set(ref(db, `${USER_DMS}/${myUid}/${dmId}`), {
      dmId, otherUid,
      otherNickname, otherEmoji,
      lastText: text, lastAt: now,
    }),
    set(ref(db, `${USER_DMS}/${otherUid}/${dmId}`), {
      dmId, otherUid: myUid,
      otherNickname: myNickname,
      otherEmoji: myEmoji,
      lastText: text, lastAt: now,
      unread: true,
    }),
  ]);
}

export function subscribeToDMMessages(dmId, onUpdate) {
  const r = ref(db, `${DMS}/${dmId}/messages`);
  onValue(r, (snap) => {
    const val = snap.val();
    if (!val) { onUpdate([]); return; }
    onUpdate(
      Object.entries(val)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => a.sentAt - b.sentAt)
    );
  });
  return () => off(r);
}

export function subscribeToDMList(uid, onUpdate) {
  const r = ref(db, `${USER_DMS}/${uid}`);
  onValue(r, (snap) => {
    const val = snap.val();
    if (!val) { onUpdate([]); return; }
    onUpdate(Object.values(val).sort((a, b) => b.lastAt - a.lastAt));
  });
  return () => off(r);
}

export async function markDMRead(dmId, uid) {
  await set(ref(db, `${USER_DMS}/${uid}/${dmId}/unread`), false);
}

// ─── Typing indicator ────────────────────────────────────────────────────────

export function setDMTyping(dmId, uid, isTyping) {
  return set(ref(db, `${DMS}/${dmId}/typing/${uid}`), !!isTyping);
}

export function subscribeToDMTyping(dmId, otherUid, onUpdate) {
  const r = ref(db, `${DMS}/${dmId}/typing/${otherUid}`);
  onValue(r, (snap) => onUpdate(snap.val() === true));
  return () => off(r);
}

// ─── Read receipts ───────────────────────────────────────────────────────────

export function setDMLastRead(dmId, uid, ts = Date.now()) {
  return set(ref(db, `${DMS}/${dmId}/lastRead/${uid}`), ts);
}

export function subscribeToDMLastRead(dmId, otherUid, onUpdate) {
  const r = ref(db, `${DMS}/${dmId}/lastRead/${otherUid}`);
  onValue(r, (snap) => onUpdate(snap.val() ?? 0));
  return () => off(r);
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export function setDMReaction(dmId, msgId, uid, emoji) {
  const r = ref(db, `${DMS}/${dmId}/messages/${msgId}/reactions/${uid}`);
  return emoji ? set(r, emoji) : remove(r);
}

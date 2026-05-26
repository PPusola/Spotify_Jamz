import { db } from "./firebase";
import { ref, set, get, onValue, off, push, remove } from "firebase/database";

const BLOCKS = "blocks";
const REPORTS = "reports";

/**
 * Block another user. Writes blocks/{myUid}/{otherUid} with their nickname so
 * the BlockedUsersScreen can render without a second profile lookup.
 *
 * Blocking is one-sided: the blocker stops seeing the blocked user across
 * Matches, Discover, and DMs. The other user is NOT notified.
 */
export async function blockUser(myUid, otherUid, otherNickname = "") {
  if (!myUid || !otherUid || myUid === otherUid) return;
  await set(ref(db, `${BLOCKS}/${myUid}/${otherUid}`), {
    nickname: String(otherNickname).slice(0, 50),
    blockedAt: Date.now(),
  });
}

export async function unblockUser(myUid, otherUid) {
  if (!myUid || !otherUid) return;
  await remove(ref(db, `${BLOCKS}/${myUid}/${otherUid}`));
}

/**
 * One-shot read of my blocked set — Set<uid>. Useful when filtering lists.
 */
export async function getBlockedUids(myUid) {
  if (!myUid) return new Set();
  const snap = await get(ref(db, `${BLOCKS}/${myUid}`));
  if (!snap.exists()) return new Set();
  return new Set(Object.keys(snap.val() || {}));
}

/**
 * Real-time subscription to my blocked map — { uid: { nickname, blockedAt } }.
 * Returns unsubscribe.
 */
export function subscribeToBlocks(myUid, onUpdate) {
  if (!myUid) return () => {};
  const r = ref(db, `${BLOCKS}/${myUid}`);
  onValue(r, (snap) => onUpdate(snap.val() ?? {}));
  return () => off(r);
}

/**
 * File a report. Stored at reports/{autoId}; reviewed manually for now.
 */
export async function reportUser({ reporterUid, reportedUid, reason, context }) {
  if (!reporterUid || !reportedUid || !reason) return;
  const r = push(ref(db, REPORTS));
  await set(r, {
    reporterUid,
    reportedUid,
    reason: String(reason).slice(0, 100),
    context: context ? String(context).slice(0, 500) : null,
    createdAt: Date.now(),
  });
}

export const REPORT_REASONS = [
  "Harassment or hate speech",
  "Inappropriate photos",
  "Spam or scam",
  "Underage user",
  "Impersonation",
  "Other",
];

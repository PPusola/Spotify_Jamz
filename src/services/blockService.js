import { db } from "./firebase";
import { ref, set, get, onValue, off, push, remove } from "firebase/database";

const BLOCKS = "blocks";
const BLOCKED_BY = "blockedBy";
const REPORTS = "reports";

/**
 * Block another user. Writes:
 *   blocks/{myUid}/{otherUid}     — my block list (with nickname for the UI)
 *   blockedBy/{otherUid}/{myUid}  — reverse index so the blocked user can also
 *                                   filter me out (blocking is mutual in effect).
 *
 * The other user is NOT notified; they just stop seeing me in Matches, Discover,
 * and DMs — same as I stop seeing them.
 */
export async function blockUser(myUid, otherUid, otherNickname = "") {
  if (!myUid || !otherUid || myUid === otherUid) return;
  await Promise.all([
    set(ref(db, `${BLOCKS}/${myUid}/${otherUid}`), {
      nickname: String(otherNickname).slice(0, 50),
      blockedAt: Date.now(),
    }),
    set(ref(db, `${BLOCKED_BY}/${otherUid}/${myUid}`), true),
  ]);
}

export async function unblockUser(myUid, otherUid) {
  if (!myUid || !otherUid) return;
  await Promise.all([
    remove(ref(db, `${BLOCKS}/${myUid}/${otherUid}`)),
    remove(ref(db, `${BLOCKED_BY}/${otherUid}/${myUid}`)),
  ]);
}

/**
 * One-shot read of everyone I can't see — both people I blocked and people who
 * blocked me. Set<uid>. Used when filtering Discover.
 */
export async function getBlockedUids(myUid) {
  if (!myUid) return new Set();
  const [mine, byOthers] = await Promise.all([
    get(ref(db, `${BLOCKS}/${myUid}`)),
    get(ref(db, `${BLOCKED_BY}/${myUid}`)),
  ]);
  return new Set([
    ...Object.keys(mine.val() || {}),
    ...Object.keys(byOthers.val() || {}),
  ]);
}

/**
 * Real-time subscription to my blocked map — { uid: { nickname, blockedAt } }.
 * Only the people *I* blocked (drives BlockedUsersScreen). Returns unsubscribe.
 */
export function subscribeToBlocks(myUid, onUpdate) {
  if (!myUid) return () => {};
  const r = ref(db, `${BLOCKS}/${myUid}`);
  onValue(r, (snap) => onUpdate(snap.val() ?? {}));
  return () => off(r);
}

/**
 * Real-time subscription to the full hidden set (people I blocked ∪ people who
 * blocked me) as a Set<uid>. Used to filter Matches and DM lists both ways.
 * Returns unsubscribe.
 */
export function subscribeToHiddenUids(myUid, onUpdate) {
  if (!myUid) return () => {};
  const mineRef = ref(db, `${BLOCKS}/${myUid}`);
  const byRef = ref(db, `${BLOCKED_BY}/${myUid}`);
  let mine = {};
  let byOthers = {};
  const emit = () =>
    onUpdate(new Set([...Object.keys(mine), ...Object.keys(byOthers)]));
  onValue(mineRef, (snap) => { mine = snap.val() ?? {}; emit(); });
  onValue(byRef, (snap) => { byOthers = snap.val() ?? {}; emit(); });
  return () => { off(mineRef); off(byRef); };
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

import { db } from "./firebase";
import { ref, get, set, update, remove } from "firebase/database";
import { CUSTOM_TOKEN_URL } from "@env";

const DELETED_NICKNAME = "Deleted account";
const DELETED_EMOJI = "👻";

/**
 * Permanently delete the current user's data and orphan their matches/DMs
 * so the other side keeps the conversation but sees "Deleted account".
 *
 * Caller should sign out after this resolves. We also retire the Spotify→UID
 * mapping on the worker, so re-signing in with the same Spotify account mints a
 * brand-new UID. The wiped UID is never reused, so old chats keep pointing at a
 * profile-less UID and the other participant sees "Deleted account" forever.
 *
 * Not deleted (intentionally): matches/$mid and dms/$dmId nodes — those are
 * shared with the other participant so they keep the conversation history.
 *
 * @param {string} uid                  the current Firebase UID to wipe
 * @param {string} [spotifyAccessToken] used to retire the UID mapping on the worker
 */
export async function deleteAccount(uid, spotifyAccessToken) {
  if (!uid) throw new Error("deleteAccount: missing uid");

  // 0. Read my dm/match index up front so we know what to hide before the
  //    userDMs node gets wiped.
  const userDMsSnap = await get(ref(db, `userDMs/${uid}`));
  const myDmIds = userDMsSnap.exists() ? Object.keys(userDMsSnap.val()) : [];

  const matchesSnap = await get(ref(db, "matches"));
  const myMatchIds = matchesSnap.exists()
    ? Object.entries(matchesSnap.val())
        .filter(([, m]) => m?.user1 === uid || m?.user2 === uid)
        .map(([mid]) => mid)
    : [];

  // 1. Stamp hiddenFor on every match and dm I'm in. The other side keeps
  //    seeing the chat; my side filters on this flag and shows nothing.
  await Promise.all([
    ...myMatchIds.map((mid) =>
      set(ref(db, `matches/${mid}/hiddenFor/${uid}`), true).catch(() => {})
    ),
    ...myDmIds.map((dmId) =>
      set(ref(db, `dms/${dmId}/hiddenFor/${uid}`), true).catch(() => {})
    ),
  ]);

  // 2. Mark "Deleted account" on the other side of each DM so their DM list
  //    doesn't keep showing my old nickname.
  if (userDMsSnap.exists()) {
    const dmEntries = userDMsSnap.val();
    await Promise.all(
      Object.entries(dmEntries).map(async ([dmId, entry]) => {
        const otherUid = entry?.otherUid;
        if (!otherUid) return;
        await update(ref(db, `userDMs/${otherUid}/${dmId}`), {
          otherNickname: DELETED_NICKNAME,
          otherEmoji: DELETED_EMOJI,
        }).catch(() => {});
      })
    );
  }

  // 3. Remove me from friends lists on both sides (rules allow either side to
  //    write the cross-edge, so I can clear my entry from each friend too).
  const friendsSnap = await get(ref(db, `friends/${uid}`));
  if (friendsSnap.exists()) {
    const friendIds = Object.keys(friendsSnap.val());
    await Promise.all(
      friendIds.map((fid) =>
        remove(ref(db, `friends/${fid}/${uid}`)).catch(() => {})
      )
    );
  }

  // 4. Iterate-and-delete for nodes without a parent-level write rule.
  await Promise.all([
    deleteAllChildren(`likes/${uid}`),
    deleteAllChildren(`passed/${uid}`),
    deleteAllChildren(`friends/${uid}`),
    deleteAllChildren(`userDMs/${uid}`),
  ]);

  // 5. Top-level owned nodes can be wiped in one shot.
  await Promise.all([
    set(ref(db, `users/${uid}`), null).catch(() => {}),
    set(ref(db, `userPrivate/${uid}`), null).catch(() => {}),
    set(ref(db, `blocks/${uid}`), null).catch(() => {}),
    set(ref(db, `pushTokens/${uid}`), null).catch(() => {}),
  ]);

  // 6. Retire the Spotify→UID mapping so the next login mints a fresh UID.
  await retireUidMapping(spotifyAccessToken);
}

/**
 * Ask the worker to rotate this Spotify account's UID. Best-effort: if the
 * worker is unreachable, deletion still succeeds — the user just keeps the
 * same UID on next login (data already wiped → still routed to fresh setup).
 */
async function retireUidMapping(spotifyAccessToken) {
  if (!CUSTOM_TOKEN_URL || !spotifyAccessToken) return;
  const base = CUSTOM_TOKEN_URL.endsWith("/") ? CUSTOM_TOKEN_URL.slice(0, -1) : CUSTOM_TOKEN_URL;
  try {
    await fetch(`${base}/retire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotifyAccessToken }),
    });
  } catch (e) {
    console.warn("[delete] retire UID mapping failed:", e?.message);
  }
}

async function deleteAllChildren(path) {
  const snap = await get(ref(db, path));
  if (!snap.exists()) return;
  const keys = Object.keys(snap.val());
  await Promise.all(
    keys.map((k) => remove(ref(db, `${path}/${k}`)).catch(() => {}))
  );
}

export const DELETED_ACCOUNT_NICKNAME = DELETED_NICKNAME;
export const DELETED_ACCOUNT_EMOJI = DELETED_EMOJI;

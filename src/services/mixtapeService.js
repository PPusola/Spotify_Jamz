import { db } from "./firebase";
import { ref, get, set } from "firebase/database";
import { getProfile } from "./userService";
import { searchTracksByGenre } from "./spotify";

const MATCHES = "matches";
const MIXTAPE_SIZE = 25;
const MAX_PER_ARTIST = 6;

const REASON = {
  COMMON_TRACK: "common_track",
  COMMON_ARTIST: "common_artist",
  SHARED_TASTE: "shared_taste",
  COMMON_GENRE: "common_genre",
  TOP_PICK: "top_pick",
};

function norm(s) {
  return (s ?? "").toString().trim().toLowerCase();
}

/**
 * Reorder tracks so the same artist isn't bunched in a row.
 * Greedy: at each step pick the artist with the most remaining tracks
 * (skipping the one we picked last). Stable when there's no choice.
 */
function spaceByArtist(tracks) {
  const buckets = new Map(); // artistKey -> [tracks]
  for (const t of tracks) {
    const k = norm(t.artistName) || "__unknown__";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(t);
  }

  const result = [];
  let lastArtist = null;

  while (result.length < tracks.length) {
    // Pick artist with most remaining tracks, excluding lastArtist if possible.
    let bestKey = null;
    let bestCount = 0;
    for (const [k, arr] of buckets) {
      if (arr.length === 0) continue;
      if (k === lastArtist) continue;
      if (arr.length > bestCount) { bestKey = k; bestCount = arr.length; }
    }
    // Only the lastArtist has tracks left — accept the repeat.
    if (!bestKey) {
      for (const [k, arr] of buckets) {
        if (arr.length > 0) { bestKey = k; break; }
      }
      if (!bestKey) break;
    }
    result.push(buckets.get(bestKey).shift());
    lastArtist = bestKey;
  }
  return result;
}

function buildLocalMixtape(profileA, profileB, uidA, uidB) {
  const aTracks = profileA?.topTracks ?? [];
  const bTracks = profileB?.topTracks ?? [];
  const aArtists = new Set((profileA?.topArtists ?? []).map(norm));
  const bArtists = new Set((profileB?.topArtists ?? []).map(norm));

  const aTrackIds = new Set(aTracks.map((t) => t.id).filter(Boolean));
  const bTrackIds = new Set(bTracks.map((t) => t.id).filter(Boolean));

  const all = [...aTracks, ...bTracks];
  const seen = new Set();
  const artistCount = new Map(); // norm(artistName) -> count in result
  const result = [];

  const push = (track, reason, ownerUid) => {
    if (!track?.id || seen.has(track.id)) return;
    const artistKey = norm(track.artistName);
    if (artistKey && (artistCount.get(artistKey) ?? 0) >= MAX_PER_ARTIST) return;
    seen.add(track.id);
    if (artistKey) artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1);
    result.push({ ...track, reason, ownerUid: ownerUid ?? null });
  };

  // Tier 1: tracks both users have in their top
  for (const t of all) {
    if (result.length >= MIXTAPE_SIZE) return result;
    if (aTrackIds.has(t.id) && bTrackIds.has(t.id)) {
      push(t, REASON.COMMON_TRACK);
    }
  }

  // Tier 2: tracks whose artist appears in BOTH users' top artists
  for (const t of all) {
    if (result.length >= MIXTAPE_SIZE) return result;
    const artistKey = norm(t.artistName);
    if (artistKey && aArtists.has(artistKey) && bArtists.has(artistKey)) {
      push(t, REASON.COMMON_ARTIST);
    }
  }

  // Tier 3: A's tracks whose artist B also likes (and vice versa)
  for (const t of aTracks) {
    if (result.length >= MIXTAPE_SIZE) return result;
    if (bArtists.has(norm(t.artistName))) push(t, REASON.SHARED_TASTE, uidA);
  }
  for (const t of bTracks) {
    if (result.length >= MIXTAPE_SIZE) return result;
    if (aArtists.has(norm(t.artistName))) push(t, REASON.SHARED_TASTE, uidB);
  }

  // Tier 4 (guarantees a full mixtape): alternate-fill from each user's
  // remaining top tracks even without explicit overlap.
  let i = 0, j = 0;
  while (
    result.length < MIXTAPE_SIZE &&
    (i < aTracks.length || j < bTracks.length)
  ) {
    while (i < aTracks.length && seen.has(aTracks[i]?.id)) i++;
    if (i < aTracks.length && result.length < MIXTAPE_SIZE) {
      push(aTracks[i++], REASON.TOP_PICK, uidA);
    }
    while (j < bTracks.length && seen.has(bTracks[j]?.id)) j++;
    if (j < bTracks.length && result.length < MIXTAPE_SIZE) {
      push(bTracks[j++], REASON.TOP_PICK, uidB);
    }
  }

  return result;
}

async function fillFromGenres(existing, profileA, profileB, accessToken) {
  if (!accessToken || existing.length >= MIXTAPE_SIZE) return existing;

  const aGenres = new Set((profileA?.topGenres ?? []).map(norm));
  const bGenres = new Set((profileB?.topGenres ?? []).map(norm));
  const shared = [...aGenres].filter((g) => bGenres.has(g));
  if (shared.length === 0) return existing;

  const seen = new Set(existing.map((t) => t.id));
  const artistCount = new Map();
  for (const t of existing) {
    const k = norm(t?.artistName);
    if (k) artistCount.set(k, (artistCount.get(k) ?? 0) + 1);
  }
  const result = [...existing];

  for (const genre of shared) {
    if (result.length >= MIXTAPE_SIZE) break;
    try {
      const tracks = await searchTracksByGenre(genre, accessToken, 10);
      for (const t of tracks) {
        if (result.length >= MIXTAPE_SIZE) break;
        if (!t.id || seen.has(t.id)) continue;
        const k = norm(t.artistName);
        if (k && (artistCount.get(k) ?? 0) >= MAX_PER_ARTIST) continue;
        seen.add(t.id);
        if (k) artistCount.set(k, (artistCount.get(k) ?? 0) + 1);
        result.push({ ...t, reason: REASON.COMMON_GENRE, genre });
      }
    } catch {
      // Search can 403 if scope missing; just skip this genre.
    }
  }

  return result;
}

/**
 * Generate a mixtape for a match and persist it under MATCHES/{mid}/mixtape.
 * Safe to call multiple times — overwrites the existing mixtape.
 *
 * @param {string} mid       Match id (sorted "uid1_uid2")
 * @param {string} uidA      One of the matched users
 * @param {string} uidB      The other matched user
 * @param {string?} accessToken  Spotify token (used for genre search). Optional.
 */
export async function generateAndSaveMixtape(mid, uidA, uidB, accessToken) {
  const [profileA, profileB] = await Promise.all([
    getProfile(uidA),
    getProfile(uidB),
  ]);

  let tracks = buildLocalMixtape(profileA, profileB, uidA, uidB);

  if (tracks.length < MIXTAPE_SIZE) {
    tracks = await fillFromGenres(tracks, profileA, profileB, accessToken);
  }

  // Reorder so the same artist isn't shown back-to-back.
  tracks = spaceByArtist(tracks);

  await set(ref(db, `${MATCHES}/${mid}/mixtape`), {
    tracks,
    generatedAt: Date.now(),
  });

  return tracks;
}

export async function getMixtape(mid) {
  const snap = await get(ref(db, `${MATCHES}/${mid}/mixtape`));
  return snap.exists() ? snap.val() : null;
}

export const MIXTAPE_REASON = REASON;

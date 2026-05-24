import { db } from "./firebase";
import { ref, get, set } from "firebase/database";
import { getProfile } from "./userService";
import { searchTracksByGenre } from "./spotify";

const MATCHES = "matches";
const MIXTAPE_SIZE = 20;

const REASON = {
  COMMON_TRACK: "common_track",
  COMMON_ARTIST: "common_artist",
  SHARED_TASTE: "shared_taste",
  COMMON_GENRE: "common_genre",
};

function norm(s) {
  return (s ?? "").toString().trim().toLowerCase();
}

function buildLocalMixtape(profileA, profileB) {
  const aTracks = profileA?.topTracks ?? [];
  const bTracks = profileB?.topTracks ?? [];
  const aArtists = new Set((profileA?.topArtists ?? []).map(norm));
  const bArtists = new Set((profileB?.topArtists ?? []).map(norm));

  const aTrackIds = new Set(aTracks.map((t) => t.id).filter(Boolean));
  const bTrackIds = new Set(bTracks.map((t) => t.id).filter(Boolean));

  const all = [...aTracks, ...bTracks];
  const seen = new Set();
  const result = [];

  const push = (track, reason) => {
    if (!track?.id || seen.has(track.id)) return;
    seen.add(track.id);
    result.push({ ...track, reason });
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
    if (bArtists.has(norm(t.artistName))) push(t, REASON.SHARED_TASTE);
  }
  for (const t of bTracks) {
    if (result.length >= MIXTAPE_SIZE) return result;
    if (aArtists.has(norm(t.artistName))) push(t, REASON.SHARED_TASTE);
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
  const result = [...existing];

  for (const genre of shared) {
    if (result.length >= MIXTAPE_SIZE) break;
    try {
      const tracks = await searchTracksByGenre(genre, accessToken, 10);
      for (const t of tracks) {
        if (result.length >= MIXTAPE_SIZE) break;
        if (!t.id || seen.has(t.id)) continue;
        seen.add(t.id);
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

  let tracks = buildLocalMixtape(profileA, profileB);

  if (tracks.length < MIXTAPE_SIZE) {
    tracks = await fillFromGenres(tracks, profileA, profileB, accessToken);
  }

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

// Music compatibility scoring (pure JS, on-device).
//
// We score *concrete overlap* rather than raw cosine similarity. Cosine alone
// made everyone a 99% match: it measures the angle between L1-normalized genre
// vectors, so any two people who broadly like mainstream genres point the same
// way. Instead we blend shared top artists, shared genre buckets (Jaccard), and
// a lightly-weighted genre-direction cosine, then map onto a believable band so
// scores actually spread out across users.

import { cosineSimilarity } from "./similarity";

// ─── Feature engineering ──────────────────────────────────────────────────────

// Genre buckets — every Spotify sub-genre maps to one of these via keyword match.
// Order matters: it defines the index of each feature in the user vector.
const GENRE_BUCKETS = [
  { key: "pop",        match: ["pop"] },
  { key: "hiphop",     match: ["hip hop", "hip-hop", "rap", "trap", "drill"] },
  { key: "indie",      match: ["indie", "alternative", "alt"] },
  { key: "rock",       match: ["rock", "punk", "grunge"] },
  { key: "metal",      match: ["metal", "hardcore"] },
  { key: "electronic", match: ["electronic", "edm", "house", "techno", "dubstep", "trance", "dnb"] },
  { key: "rnb",        match: ["r&b", "rnb", "soul", "funk"] },
  { key: "latin",      match: ["latin", "reggaeton", "salsa", "bachata"] },
  { key: "jazz",       match: ["jazz", "blues"] },
  { key: "classical",  match: ["classical", "orchestral", "opera"] },
  { key: "country",    match: ["country", "folk", "americana"] },
  { key: "world",      match: ["k-pop", "j-pop", "afrobeat", "reggae"] },
];

export const VECTOR_DIM = GENRE_BUCKETS.length + 2; // + popularity + artist diversity

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

function bucketOf(genre) {
  const g = String(genre || "").toLowerCase();
  for (let i = 0; i < GENRE_BUCKETS.length; i++) {
    if (GENRE_BUCKETS[i].match.some(kw => g.includes(kw))) return i;
  }
  return -1; // unbucketed
}

/**
 * Build a numeric taste vector for a single user profile.
 * Vector shape: [genre_bucket_counts (12), popularity_proxy, artist_diversity]
 * All features L1-normalized within their group so users with more data
 * don't dominate the clustering.
 */
export function buildUserVector(profile) {
  const vec = new Array(VECTOR_DIM).fill(0);
  if (!profile) return vec;

  const genres = toArray(profile.topGenres);
  const artists = toArray(profile.topArtists);

  // Genre buckets — normalized to sum to 1 (or all 0 if no genres bucketed)
  let bucketSum = 0;
  for (const g of genres) {
    const idx = bucketOf(g);
    if (idx >= 0) { vec[idx] += 1; bucketSum += 1; }
  }
  if (bucketSum > 0) {
    for (let i = 0; i < GENRE_BUCKETS.length; i++) vec[i] /= bucketSum;
  }

  // Popularity proxy — log-scaled follower count, clamped to [0,1]
  const followers = Number(profile.followerCount) || 0;
  vec[GENRE_BUCKETS.length] = Math.min(Math.log10(followers + 1) / 6, 1); // 1M followers → ~1.0

  // Artist diversity — number of distinct top artists, normalized
  vec[GENRE_BUCKETS.length + 1] = Math.min(artists.length / 10, 1);

  return vec;
}

// ─── Overlap helpers ──────────────────────────────────────────────────────────

function lowerSet(arr) {
  return new Set(toArray(arr).map(x => String(x).toLowerCase().trim()).filter(Boolean));
}

function genreBucketSet(genres) {
  const s = new Set();
  for (const g of toArray(genres)) {
    const idx = bucketOf(g);
    if (idx >= 0) s.add(idx);
  }
  return s;
}

// Genre-bucket portion of the vector only (drop popularity/diversity dims).
function genreVector(profile) {
  return buildUserVector(profile).slice(0, GENRE_BUCKETS.length);
}

function intersectionSize(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Realistic music compatibility in [0,1]. Blends:
 *   - shared top artists  (50%) — strongest, most intuitive signal
 *   - shared genre buckets (30%) — Jaccard overlap
 *   - genre emphasis       (20%) — cosine direction, lightly weighted
 * then maps onto ~25–96% so even taste twins rarely read a literal 100% and
 * strangers still get a non-zero baseline. Returns a spread, not 99% for all.
 */
export function realisticMatchScore(me, them) {
  const sharedArtists = intersectionSize(lowerSet(me?.topArtists), lowerSet(them?.topArtists));
  // 4+ shared top artists is a very strong signal → full marks on this component
  const artistScore = sharedArtists === 0 ? 0 : Math.min(1, sharedArtists / 4);

  const myGenres = genreBucketSet(me?.topGenres);
  const themGenres = genreBucketSet(them?.topGenres);
  const unionG = new Set([...myGenres, ...themGenres]).size;
  const genreJaccard = unionG === 0 ? 0 : intersectionSize(myGenres, themGenres) / unionG;

  const genreCos = cosineSimilarity(genreVector(me), genreVector(them));

  const raw = 0.5 * artistScore + 0.3 * genreJaccard + 0.2 * genreCos;
  const pct = 25 + raw * 71;
  return Math.max(0.1, Math.min(0.96, pct / 100));
}

/** Back-compat single-pair scorer. */
export function mlMatchScore(meProfile, themProfile) {
  return realisticMatchScore(meProfile, themProfile);
}

/**
 * The concrete overlap behind a score — shared top artists and shared genres
 * (exact, case-insensitive), preserving the other user's display casing.
 * Used by the profile view to explain *why* two people match.
 */
export function sharedTaste(me, them) {
  const overlap = (mineRaw, theirsRaw) => {
    const theirs = new Set(toArray(theirsRaw).map(x => String(x).toLowerCase().trim()));
    const out = [];
    const seen = new Set();
    for (const x of toArray(mineRaw)) {
      const k = String(x).toLowerCase().trim();
      if (k && theirs.has(k) && !seen.has(k)) { out.push(x); seen.add(k); }
    }
    return out;
  };
  return {
    artists: overlap(me?.topArtists, them?.topArtists).slice(0, 6),
    genres: overlap(me?.topGenres, them?.topGenres).slice(0, 6),
  };
}

/**
 * Score a list of candidates against the current user. Returns each candidate
 * with an added `score` field in [0,1], sorted by score descending.
 */
export function mlScoreCandidates(meProfile, candidates) {
  if (!candidates || candidates.length === 0) return [];
  return candidates
    .map(c => ({ ...c, score: realisticMatchScore(meProfile, c) }))
    .sort((a, b) => b.score - a.score);
}

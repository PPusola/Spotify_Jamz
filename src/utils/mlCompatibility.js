// ML-based user compatibility:
//   1. Build a numeric "taste vector" for each user from Spotify-derived data.
//   2. Cluster all candidate users with K-Means (K-Means++ init).
//   3. Score a pair = cosine_similarity(vec_a, vec_b) + small boost if they
//      fall into the same cluster.
//
// Pure JS so it runs on-device — no Python / sklearn required.

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

// ─── K-Means clustering (K-Means++ init) ──────────────────────────────────────

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function meanVector(vectors, dim) {
  const out = new Array(dim).fill(0);
  if (vectors.length === 0) return out;
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Pick initial centroids using K-Means++: first random, then each subsequent
 * centroid is sampled with probability proportional to D(x)² (distance to
 * nearest existing centroid). Produces tighter clusters than random init.
 */
function kMeansPlusPlusInit(vectors, k, rand) {
  const centroids = [vectors[Math.floor(rand() * vectors.length)].slice()];
  while (centroids.length < k) {
    const dists = vectors.map(v => {
      let min = Infinity;
      for (const c of centroids) {
        const d = euclidean(v, c);
        if (d < min) min = d;
      }
      return min * min;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    if (total === 0) { centroids.push(vectors[0].slice()); continue; }
    let r = rand() * total;
    let idx = 0;
    for (; idx < dists.length - 1; idx++) {
      r -= dists[idx];
      if (r <= 0) break;
    }
    centroids.push(vectors[idx].slice());
  }
  return centroids;
}

/**
 * Cluster vectors into k groups. Returns { labels, centroids }.
 *   labels[i]   = cluster index assigned to vectors[i]
 *   centroids[c] = mean vector of cluster c
 */
export function kMeans(vectors, k, { maxIter = 20, seed = 42 } = {}) {
  if (vectors.length === 0) return { labels: [], centroids: [] };
  const dim = vectors[0].length;
  const realK = Math.max(1, Math.min(k, vectors.length));

  // Deterministic PRNG for reproducible clusters across renders
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 0x100000000;
    return s / 0x100000000;
  };

  let centroids = kMeansPlusPlusInit(vectors, realK, rand);
  let labels = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each vector to nearest centroid
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = euclidean(vectors[i], centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    if (!changed && iter > 0) break;

    // Recompute centroids
    const groups = Array.from({ length: realK }, () => []);
    for (let i = 0; i < vectors.length; i++) groups[labels[i]].push(vectors[i]);
    centroids = groups.map((g, c) =>
      g.length > 0 ? meanVector(g, dim) : centroids[c]
    );
  }

  return { labels, centroids };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

const SAME_CLUSTER_BOOST = 0.1;

/**
 * Heuristic for k: roughly sqrt(N/2), clamped to [2, 6].
 * Small candidate pools cluster poorly with large k.
 */
function pickK(n) {
  return Math.max(2, Math.min(6, Math.round(Math.sqrt(n / 2))));
}

/**
 * Score a single candidate against the current user.
 * Use mlScoreCandidates() for batch scoring — clustering is shared across calls.
 */
export function mlMatchScore(meProfile, themProfile) {
  const a = buildUserVector(meProfile);
  const b = buildUserVector(themProfile);
  return cosineSimilarity(a, b);
}

/**
 * Score a list of candidates against the current user using clustering.
 * Returns the same array of candidates with an added `score` field in [0,1],
 * sorted by score descending.
 *
 * Flow (mirrors sklearn KMeans + cosine_similarity):
 *   1. Build vectors for [me, ...candidates]
 *   2. Cluster all of them with K-Means
 *   3. score = cosine(me, them) + 0.1 if same cluster, clamped to 1
 */
export function mlScoreCandidates(meProfile, candidates) {
  if (!candidates || candidates.length === 0) return [];

  const vectors = [buildUserVector(meProfile), ...candidates.map(buildUserVector)];
  const { labels } = kMeans(vectors, pickK(vectors.length));
  const meVec = vectors[0];
  const meCluster = labels[0];

  return candidates
    .map((c, i) => {
      const themVec = vectors[i + 1];
      const sim = cosineSimilarity(meVec, themVec);
      const boost = labels[i + 1] === meCluster ? SAME_CLUSTER_BOOST : 0;
      return { ...c, score: Math.min(1, sim + boost), cluster: labels[i + 1] };
    })
    .sort((a, b) => b.score - a.score);
}

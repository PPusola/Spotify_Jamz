import {
  buildUserVector,
  kMeans,
  mlMatchScore,
  mlScoreCandidates,
  VECTOR_DIM,
} from '../../src/utils/mlCompatibility';

describe('buildUserVector', () => {
  it('returns an all-zero vector for empty/missing profiles', () => {
    expect(buildUserVector(null)).toEqual(new Array(VECTOR_DIM).fill(0));
    expect(buildUserVector({})).toEqual(new Array(VECTOR_DIM).fill(0));
  });

  it('puts genres into the correct buckets and normalizes to sum 1', () => {
    const v = buildUserVector({ topGenres: ['pop', 'pop', 'hip-hop', 'indie rock'] });
    const genreSum = v.slice(0, 12).reduce((s, x) => s + x, 0);
    expect(genreSum).toBeCloseTo(1);
    // pop bucket index 0, hiphop index 1
    expect(v[0]).toBeCloseTo(2 / 4);
    expect(v[1]).toBeCloseTo(1 / 4);
  });

  it('log-scales follower count into popularity proxy', () => {
    const popIdx = 12;
    expect(buildUserVector({ followerCount: 0 })[popIdx]).toBe(0);
    expect(buildUserVector({ followerCount: 1_000_000 })[popIdx]).toBeCloseTo(1, 1);
  });

  it('handles Firebase object format for topGenres', () => {
    const vObj = buildUserVector({ topGenres: { 0: 'pop', 1: 'rock' } });
    const vArr = buildUserVector({ topGenres: ['pop', 'rock'] });
    expect(vObj).toEqual(vArr);
  });

  it('caps artist diversity at 1.0', () => {
    const v = buildUserVector({ topArtists: Array.from({ length: 50 }, (_, i) => `A${i}`) });
    expect(v[13]).toBe(1);
  });
});

describe('kMeans', () => {
  it('returns empty result for empty input', () => {
    const { labels, centroids } = kMeans([], 3);
    expect(labels).toEqual([]);
    expect(centroids).toEqual([]);
  });

  it('groups two well-separated blobs into two clusters', () => {
    const blobA = [[0, 0], [0.1, 0.1], [0, 0.2]];
    const blobB = [[10, 10], [10.1, 9.9], [9.9, 10.2]];
    const { labels } = kMeans([...blobA, ...blobB], 2);

    // All of blob A should share a label; same for blob B
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3, 6)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
  });

  it('clamps k to the number of vectors when k is too large', () => {
    const { centroids } = kMeans([[1, 1], [2, 2]], 10);
    expect(centroids.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic across runs with the same seed', () => {
    const data = [[0, 0], [1, 1], [10, 10], [11, 11]];
    const a = kMeans(data, 2).labels;
    const b = kMeans(data, 2).labels;
    expect(a).toEqual(b);
  });
});

describe('mlMatchScore', () => {
  it('returns 1.0 for identical taste profiles', () => {
    const p = { topGenres: ['pop', 'indie'], topArtists: ['A', 'B'], followerCount: 100 };
    expect(mlMatchScore(p, p)).toBeCloseTo(1.0);
  });

  it('returns low score for orthogonal genre tastes', () => {
    const p1 = { topGenres: ['classical'], topArtists: [], followerCount: 0 };
    const p2 = { topGenres: ['metal'], topArtists: [], followerCount: 0 };
    expect(mlMatchScore(p1, p2)).toBeLessThan(0.5);
  });

  it('returns a number in [0,1]', () => {
    const score = mlMatchScore(
      { topGenres: ['pop', 'hip-hop'] },
      { topGenres: ['pop', 'rock'] },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('mlScoreCandidates', () => {
  const me = { topGenres: ['pop', 'pop', 'indie'], topArtists: ['Alice'], followerCount: 500 };
  const candidates = [
    { uid: 'c1', topGenres: ['pop', 'indie'], topArtists: ['Alice'] },     // close to me
    { uid: 'c2', topGenres: ['metal', 'metal'], topArtists: ['Slayer'] },  // far from me
    { uid: 'c3', topGenres: ['pop'], topArtists: ['Bob'] },                // moderately close
    { uid: 'c4', topGenres: ['classical'], topArtists: ['Bach'] },         // far from me
  ];

  it('returns one scored candidate per input, sorted descending by score', () => {
    const scored = mlScoreCandidates(me, candidates);
    expect(scored).toHaveLength(4);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it('ranks the most similar candidate first', () => {
    const scored = mlScoreCandidates(me, candidates);
    expect(scored[0].uid).toBe('c1');
  });

  it('preserves original candidate fields and attaches score + cluster', () => {
    const scored = mlScoreCandidates(me, candidates);
    expect(scored[0]).toHaveProperty('uid');
    expect(scored[0]).toHaveProperty('score');
    expect(scored[0]).toHaveProperty('cluster');
    expect(typeof scored[0].cluster).toBe('number');
  });

  it('returns an empty array when there are no candidates', () => {
    expect(mlScoreCandidates(me, [])).toEqual([]);
    expect(mlScoreCandidates(me, null)).toEqual([]);
  });

  it('clamps scores to [0,1] even with same-cluster boost', () => {
    const scored = mlScoreCandidates(me, candidates);
    for (const c of scored) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });
});

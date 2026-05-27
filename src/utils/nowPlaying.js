// A now-playing snapshot is only "live" if the user is actually playing and the
// snapshot is recent — otherwise it's a stale leftover from a past session.
const FRESH_MS = 10 * 60 * 1000;

export function liveTrack(np) {
  if (!np || !np.isPlaying || !np.trackName) return null;
  if (typeof np.updatedAt !== "number" || Date.now() - np.updatedAt > FRESH_MS) return null;
  return np;
}

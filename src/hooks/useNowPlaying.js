import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getNowPlaying } from "@services/spotify";
import { setNowPlaying } from "@services/userService";

const POLL_MS = 30000;

/**
 * While the app is open, polls Spotify for the current track every 30s (and on
 * foreground) and writes it to the user's profile so matches can see a live
 * "🎧 listening to X" status. Readers gate on freshness; see utils/nowPlaying.
 */
export function useNowPlaying(spotifyToken, uid) {
  const timer = useRef(null);

  useEffect(() => {
    if (!spotifyToken || !uid) return;
    let cancelled = false;

    const tick = async () => {
      const np = await getNowPlaying(spotifyToken);
      if (cancelled || !np) return;
      setNowPlaying(uid, np).catch(() => {});
    };

    tick();
    timer.current = setInterval(tick, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, [spotifyToken, uid]);
}

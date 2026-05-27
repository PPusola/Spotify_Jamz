/**
 * Returns the photo URL to display for a user, given the surface it's shown on.
 *
 *   useSpotifyPhoto = false                  → null (emoji fallback everywhere)
 *   context === "discover" with the         → null
 *     showPhotoInDiscover flag off
 *   otherwise                                → user.spotifyPfp || null
 *
 * Treats missing flags as "true" so existing profiles created before the
 * feature shipped behave as if they opted in.
 */
export function effectivePhotoUrl(user, context = "default") {
  if (!user) return null;
  if (user.useSpotifyPhoto === false) return null;
  if (context === "discover" && user.showPhotoInDiscover === false) return null;
  return user.spotifyPfp || null;
}

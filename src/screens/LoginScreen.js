import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSpotifyAuth } from "@services/spotify";
import { useAuth } from "@hooks/useAuth";
import { useTheme } from "@hooks/useTheme";
import { SPOTIFY_CLIENT_ID } from "@env";
import { redirectUri } from "@services/spotify";

const PKCE_KEY = "@jamz_pkce_verifier";

const SERVICES = [
  { key: "spotify",  label: "Spotify",       dot: "#1DB954", active: true  },
  { key: "apple",    label: "Apple Music",    dot: "#FC3C44", active: false },
  { key: "youtube",  label: "YouTube Music",  dot: "#FF0000", active: false },
];

export default function LoginScreen() {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { request, response, promptAsync } = useSpotifyAuth();
  const { saveTokens } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      setLoading(true);
      handleTokenExchange(response.params.code);
    } else if (response.type === "error") {
      setError(response.error?.message || "Spotify login failed. Please try again.");
      setLoading(false);
    } else if (response.type === "dismiss" || response.type === "cancel") {
      setError(null);
      setLoading(false);
    }
  }, [response]);

  const handleTokenExchange = async (code) => {
    try {
      const codeVerifier = await AsyncStorage.getItem(PKCE_KEY);
      const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: SPOTIFY_CLIENT_ID,
          code_verifier: codeVerifier,
        }).toString(),
      });
      const data = await result.json();
      if (data.access_token) {
        await AsyncStorage.removeItem(PKCE_KEY);
        await AsyncStorage.setItem("@jamz_spotify_scope", data.scope || "");
        console.log("[Spotify] granted scopes:", data.scope);
        await saveTokens(data);
        setError(null);
      } else {
        setError("Failed to get token: " + (data.error_description || data.error));
      }
    } catch (e) {
      setError("Token exchange failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyLogin = async () => {
    setError(null);
    try {
      if (request?.codeVerifier) {
        await AsyncStorage.setItem(PKCE_KEY, request.codeVerifier);
      }
      const result = await promptAsync();
      if (result?.type === "dismiss" || result?.type === "cancel") {
        setLoading(false);
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleUnavailable = (label) => {
    Alert.alert("Coming Soon", `${label} integration is coming soon! Only Spotify is supported right now.`);
  };

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.surface, COLORS.background]}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative bg blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      {/* Brand */}
      <View style={styles.brandRow}>
        <Text style={styles.brandText}>
          <Text style={styles.brandWhite}>Tune</Text>
          <Text style={styles.brandPurple}>Match</Text>
        </Text>
        <Text style={styles.brandSub}>Find your sonic twin</Text>
      </View>

      {/* Headphones icon circle */}
      <View style={styles.iconOuter}>
        <View style={styles.iconRing}>
          <View style={styles.iconInner}>
            <Text style={styles.iconEmoji}>🎧</Text>
          </View>
        </View>
      </View>

      {/* Heading & description */}
      <View style={styles.textBlock}>
        <Text style={styles.heading}>Connect your{"\n"}music account</Text>
        <Text style={styles.description}>
          We'll analyse your taste and find people who{"\n"}hear the world like you.
        </Text>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={() => setError(null)} style={styles.errorDismiss}>
            <Text style={styles.errorDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Service rows */}
      <View style={styles.serviceList}>
        {SERVICES.map(({ key, label, dot, active }) => (
          <TouchableOpacity
            key={key}
            style={[styles.serviceRow, !active && styles.serviceRowDisabled]}
            onPress={active ? handleSpotifyLogin : () => handleUnavailable(label)}
            activeOpacity={active ? 0.75 : 0.6}
            accessibilityLabel={active ? `Connect with ${label}` : `${label} coming soon`}
          >
            {/* Left: dot + label */}
            <View style={styles.serviceLeft}>
              <View style={[styles.dot, { backgroundColor: active ? dot : COLORS.textMuted }]} />
              <Text style={[styles.serviceLabel, !active && styles.serviceLabelDimmed]}>
                {label}
              </Text>
            </View>

            {/* Right: loading or connect text */}
            {active && loading ? (
              <ActivityIndicator color={COLORS.textSecondary} size="small" />
            ) : (
              <Text style={[styles.connectText, !active && styles.connectTextDimmed]}>
                {active ? "Connect →" : "Coming soon"}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.note}>Spotify Premium required for playback control.</Text>
    </LinearGradient>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 40,
  },

  blob1: {
    position: "absolute", top: -40, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: COLORS.secondary + "1A",
  },
  blob2: {
    position: "absolute", bottom: 60, left: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: COLORS.primary + "14",
  },

  /* Brand */
  brandRow: { alignItems: "center", marginBottom: 32 },
  brandText: { fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },
  brandWhite: { color: COLORS.textPrimary },
  brandPurple: { color: COLORS.secondary },
  brandSub: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },

  /* Headphones circle */
  iconOuter: {
    marginBottom: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: COLORS.secondary + "55",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 52 },

  /* Heading */
  textBlock: { alignItems: "center", marginBottom: 28 },
  heading: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.textPrimary,
    textAlign: "center",
    lineHeight: 36,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },

  /* Error */
  errorBox: {
    backgroundColor: "#2D1515",
    borderColor: COLORS.error,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: "100%",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: { color: COLORS.error, fontSize: 13, flex: 1 },
  errorDismiss: { paddingLeft: 10 },
  errorDismissText: { color: COLORS.textMuted, fontSize: 12 },

  /* Service rows */
  serviceList: { width: "100%", gap: 12, marginBottom: 28 },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  serviceRowDisabled: { opacity: 0.55 },
  serviceLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  serviceLabel: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "600" },
  serviceLabelDimmed: { color: COLORS.textSecondary },
  connectText: { color: COLORS.textSecondary, fontSize: 14 },
  connectTextDimmed: { color: COLORS.textMuted, fontSize: 12 },

  note: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});

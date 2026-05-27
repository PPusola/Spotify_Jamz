import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, Image, TouchableOpacity, StyleSheet, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { useTheme } from "@hooks/useTheme";
import { subscribeToSharedProfile } from "@services/matchService";
import { getVibe, matchLabel } from "@utils/similarity";
import { sharedTaste } from "@utils/mlCompatibility";
import { effectivePhotoUrl } from "@utils/photoVisibility";
import { liveTrack } from "@utils/nowPlaying";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

const toArr = v => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);

export default function UserProfileScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();

  const {
    profile, score = 0, matchId, mode = "match",
    onLike, onPass,
  } = route.params || {};

  const other = profile || {};
  const pct = Math.round((score || 0) * 100);
  const vibe = getVibe(other.topGenres);
  const np = liveTrack(other.nowPlaying);
  const photoUrl = effectivePhotoUrl(other, "chat");
  const breakdown = useMemo(() => sharedTaste(myProfile, other), [myProfile, other]);

  const artists = toArr(other.topArtists).slice(0, 8);
  const genres = toArr(other.topGenres).slice(0, 8);

  // Gated photos/socials — only in match mode, only once both sides shared.
  const [sharedProfiles, setSharedProfiles] = useState({});
  useEffect(() => {
    if (mode !== "match" || !matchId) return;
    return subscribeToSharedProfile(matchId, setSharedProfiles);
  }, [mode, matchId]);

  const theirShared = other.uid ? sharedProfiles[other.uid] : null;
  const bothShared = !!sharedProfiles[user?.uid] && !!theirShared;

  const openSocial = (kind, handle) => {
    const clean = String(handle).replace(/^@/, "");
    const url = kind === "instagram"
      ? `https://instagram.com/${clean}`
      : `https://snapchat.com/add/${clean}`;
    Linking.openURL(url).catch(() => {});
  };

  const goToChat = () => {
    navigation.replace("MatchChat", {
      matchId,
      otherNickname: other.nickname,
      otherEmoji: other.emoji,
      otherUid: other.uid,
      otherPhotoUrl: photoUrl,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{other.nickname || "Profile"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={[COLORS.gradientStart + "30", COLORS.gradientEnd + "30"]}
          style={styles.avatarGlow}
        >
          <AvatarCircle photoUrl={photoUrl} name={other.nickname} size={104} useGradient />
        </LinearGradient>
        <Text style={styles.nickname}>{other.nickname}</Text>
        {other.spotifyDisplayName ? (
          <Text style={styles.spotifyName}>🎵 {other.spotifyDisplayName}</Text>
        ) : null}
        {np && (
          <Text style={styles.nowPlaying} numberOfLines={1}>
            🎧 {np.trackName}{np.artistName ? ` · ${np.artistName}` : ""}
          </Text>
        )}

        {/* Compatibility + breakdown */}
        {pct > 0 && (
          <View style={styles.card}>
            <View style={styles.compatTop}>
              <Text style={styles.compatPct}>{pct}%</Text>
              <Text style={styles.compatLabel}>{matchLabel(score)}</Text>
            </View>

            {breakdown.artists.length > 0 || breakdown.genres.length > 0 ? (
              <View style={styles.shareWrap}>
                <Text style={styles.shareHeader}>You both like</Text>
                {breakdown.artists.length > 0 && (
                  <View style={styles.chips}>
                    {breakdown.artists.map(a => (
                      <View key={a} style={styles.sharedChip}>
                        <Text style={styles.sharedChipText}>🎤 {a}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {breakdown.genres.length > 0 && (
                  <View style={styles.chips}>
                    {breakdown.genres.map(g => (
                      <View key={g} style={[styles.sharedChip, styles.genreSharedChip]}>
                        <Text style={styles.genreSharedText}>🎵 {g}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noOverlap}>🎲 Totally different tastes — opposites attract?</Text>
            )}
          </View>
        )}

        {/* Their music */}
        {artists.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>TOP ARTISTS</Text>
            <View style={styles.chips}>
              {artists.map(a => (
                <View key={a} style={styles.chip}><Text style={styles.chipText}>{a}</Text></View>
              ))}
            </View>
          </View>
        )}

        {genres.length > 0 && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>GENRES</Text>
              {vibe ? <Text style={styles.vibe}>{vibe}</Text> : null}
            </View>
            <View style={styles.chips}>
              {genres.map(g => (
                <View key={g} style={[styles.chip, styles.genreChip]}><Text style={styles.genreChipText}>{g}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* Photos & socials — gated behind mutual reveal, match mode only */}
        {mode === "match" && (
          bothShared ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>PHOTOS & SOCIALS</Text>
              {theirShared.photos?.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {theirShared.photos.map(url => (
                    <Image key={url} source={{ uri: url }} style={styles.photo} />
                  ))}
                </ScrollView>
              )}
              <View style={styles.socialRow}>
                {theirShared.instagram ? (
                  <TouchableOpacity style={[styles.socialBtn, styles.igBtn]} onPress={() => openSocial("instagram", theirShared.instagram)}>
                    <Text style={styles.socialTxt}>📸 @{String(theirShared.instagram).replace(/^@/, "")}</Text>
                  </TouchableOpacity>
                ) : null}
                {theirShared.snapchat ? (
                  <TouchableOpacity style={[styles.socialBtn, styles.snapBtn]} onPress={() => openSocial("snapchat", theirShared.snapchat)}>
                    <Text style={styles.socialTxt}>👻 {String(theirShared.snapchat).replace(/^@/, "")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[styles.card, styles.lockedCard]}>
              <Text style={styles.lockedEmoji}>🔒</Text>
              <Text style={styles.lockedText}>
                Photos & socials unlock once you both share them in chat.
              </Text>
            </View>
          )
        )}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        {mode === "discover" ? (
          <>
            <TouchableOpacity style={styles.passBtn} onPress={() => { navigation.goBack(); onPass && onPass(); }} activeOpacity={0.85}>
              <Text style={styles.passTxt}>✕ Pass</Text>
            </TouchableOpacity>
            <GradientButton
              onPress={() => { navigation.goBack(); onLike && onLike(); }}
              label="♥ Like"
              style={{ flex: 1 }}
              gradientStyle={styles.likeGrad}
            />
          </>
        ) : (
          <GradientButton onPress={goToChat} label="💬 Message" style={{ flex: 1 }} gradientStyle={styles.likeGrad} />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.surfaceAlt },
  backTxt: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold" },
  topTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "bold", flex: 1, textAlign: "center" },

  container: { padding: 20, paddingBottom: 24, alignItems: "center" },
  avatarGlow: { width: 124, height: 124, borderRadius: 62, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  nickname: { color: COLORS.textPrimary, fontSize: 24, fontWeight: "bold" },
  spotifyName: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  nowPlaying: { color: COLORS.liveGreen, fontSize: 12, marginTop: 6, maxWidth: 280, textAlign: "center" },

  card: { width: "100%", backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginTop: 16 },
  compatTop: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 4 },
  compatPct: { color: COLORS.primary, fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  compatLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },

  shareWrap: { marginTop: 10, gap: 8 },
  shareHeader: { color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  noOverlap: { color: COLORS.textSecondary, fontSize: 13, marginTop: 10, fontStyle: "italic" },

  sectionLabel: { color: COLORS.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  vibe: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 12 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: COLORS.surfaceAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: COLORS.textSecondary, fontSize: 12 },
  genreChip: { backgroundColor: COLORS.secondary + "22", borderWidth: 1, borderColor: COLORS.secondary + "44" },
  genreChipText: { color: COLORS.secondary, fontSize: 12 },
  sharedChip: { backgroundColor: COLORS.primary + "22", borderWidth: 1, borderColor: COLORS.primary + "55", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  sharedChipText: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },
  genreSharedChip: { backgroundColor: COLORS.liveGreen + "22", borderColor: COLORS.liveGreen + "55" },
  genreSharedText: { color: COLORS.liveGreen, fontSize: 12, fontWeight: "600" },

  lockedCard: { alignItems: "center", gap: 8 },
  lockedEmoji: { fontSize: 28 },
  lockedText: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },

  photo: { width: 110, height: 110, borderRadius: 14, backgroundColor: COLORS.surfaceAlt, marginTop: 4 },
  socialRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  socialBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50 },
  igBtn: { backgroundColor: "#E1306C22", borderWidth: 1, borderColor: "#E1306C66" },
  snapBtn: { backgroundColor: "#FFFC0022", borderWidth: 1, borderColor: "#FFFC0066" },
  socialTxt: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },

  actions: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, borderTopColor: COLORS.surface },
  passBtn: { flex: 1, paddingVertical: 14, borderRadius: 50, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.surfaceAlt, alignItems: "center" },
  passTxt: { color: COLORS.textMuted, fontWeight: "700", fontSize: 15 },
  likeGrad: { paddingVertical: 14, borderRadius: 50 },
});

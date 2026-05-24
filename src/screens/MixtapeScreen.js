import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@hooks/useAuth";
import { getMixtape, generateAndSaveMixtape, MIXTAPE_REASON } from "@services/mixtapeService";
import { playTrack, createPlaylistWithTracks } from "@services/spotify";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@hooks/useTheme";

const REASON_LABEL = {
  [MIXTAPE_REASON.COMMON_TRACK]: "Both love this",
  [MIXTAPE_REASON.COMMON_ARTIST]: "Shared artist",
  [MIXTAPE_REASON.SHARED_TASTE]: "Matches their taste",
  [MIXTAPE_REASON.COMMON_GENRE]: "Shared genre",
  [MIXTAPE_REASON.TOP_PICK]: "Top pick",
};

export default function MixtapeScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const REASON_COLOR = useMemo(() => ({
    [MIXTAPE_REASON.COMMON_TRACK]: "#FF4D88",
    [MIXTAPE_REASON.COMMON_ARTIST]: COLORS.primary,
    [MIXTAPE_REASON.SHARED_TASTE]: COLORS.secondary,
    [MIXTAPE_REASON.COMMON_GENRE]: "#1DB954",
    [MIXTAPE_REASON.TOP_PICK]: COLORS.textMuted,
  }), [COLORS]);
  const { matchId, otherNickname, otherUid } = route.params;
  const { user, spotifyToken } = useAuth();
  const [tracks, setTracks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [savingToSpotify, setSavingToSpotify] = useState(false);

  const handleSaveToSpotify = async () => {
    if (savingToSpotify) return;
    if (!spotifyToken) {
      Alert.alert("Not signed in", "Reconnect your Spotify account first.");
      return;
    }
    if (!tracks?.length) return;

    const uris = tracks.map((t) => t.uri).filter(Boolean);
    if (uris.length === 0) {
      Alert.alert("Nothing to save", "No playable tracks in this mixtape.");
      return;
    }

    setSavingToSpotify(true);
    try {
      const playlist = await createPlaylistWithTracks({
        name: `TuneMatch — ${otherNickname}`,
        description: `Mixtape for you & ${otherNickname}, made in TuneMatch.`,
        trackUris: uris,
        isPublic: false,
        accessToken: spotifyToken,
      });
      Alert.alert(
        "Saved to Spotify",
        `"TuneMatch — ${otherNickname}" added to your library.`,
        [
          { text: "OK", style: "cancel" },
          { text: "Open Spotify", onPress: () => Linking.openURL(playlist.url) },
        ]
      );
    } catch (e) {
      const msg = e?.message ?? "";
      const grantedScope = (await AsyncStorage.getItem("@jamz_spotify_scope")) || "(none stored)";
      Alert.alert(
        "Couldn't save playlist",
        `${msg || "Unknown error"}\n\nGranted scopes:\n${grantedScope}`
      );
    } finally {
      setSavingToSpotify(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({ title: "Your Mixtape" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer;

    const load = async () => {
      const mix = await getMixtape(matchId);
      if (cancelled) return;
      if (mix?.tracks?.length) {
        setTracks(mix.tracks);
        setLoading(false);
      } else {
        // Mixtape not generated yet — poll a few times then offer manual gen
        setLoading(false);
        pollTimer = setTimeout(load, 2000);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [matchId]);

  const handleGenerateNow = async () => {
    if (generating || !otherUid) return;
    setGenerating(true);
    try {
      const generated = await generateAndSaveMixtape(matchId, user.uid, otherUid, spotifyToken);
      setTracks(generated);
    } catch (e) {
      Alert.alert("Couldn't build mixtape", e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePlay = async (track) => {
    if (!spotifyToken) {
      Alert.alert("Not signed in", "Reconnect your Spotify account to play tracks.");
      return;
    }
    setPlayingId(track.id);
    try {
      await playTrack(track.uri, 0, spotifyToken);
    } catch (e) {
      const msg = e?.message ?? "";
      if (/premium/i.test(msg)) {
        Alert.alert("Premium required", "Spotify playback requires a Premium account.");
      } else if (/no active device|device not found/i.test(msg)) {
        Alert.alert(
          "No active device",
          "Open Spotify on a phone, desktop, or speaker first, start any track, then tap again."
        );
      } else {
        Alert.alert("Playback failed", msg || "Something went wrong.");
      }
    } finally {
      setPlayingId(null);
    }
  };

  const renderTrack = ({ item, index }) => {
    const reasonColor = REASON_COLOR[item.reason] ?? COLORS.textMuted;
    let reasonLabel = REASON_LABEL[item.reason] ?? "Pick";
    if (item.reason === MIXTAPE_REASON.TOP_PICK && item.ownerUid) {
      reasonLabel = item.ownerUid === user?.uid
        ? "Your top pick"
        : `${otherNickname}'s top`;
    }
    const isPlaying = playingId === item.id;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handlePlay(item)}
        activeOpacity={0.75}
        disabled={isPlaying}
      >
        <Text style={styles.index}>{(index + 1).toString().padStart(2, "0")}</Text>

        {item.albumImage
          ? <Image source={{ uri: item.albumImage }} style={styles.cover} />
          : <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverEmoji}>🎵</Text></View>
        }

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.artist} numberOfLines={1}>{item.artistName}</Text>
          <View style={[styles.reasonChip, { backgroundColor: reasonColor + "22", borderColor: reasonColor + "55" }]}>
            <Text style={[styles.reasonText, { color: reasonColor }]}>{reasonLabel}</Text>
          </View>
        </View>

        <View style={styles.playBtn}>
          {isPlaying
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.playIcon}>▶</Text>
          }
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!tracks || tracks.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🎵</Text>
          <Text style={styles.emptyTitle}>Mixtape not ready</Text>
          <Text style={styles.emptySub}>
            We couldn't find enough overlap yet. Tap below to try again.
          </Text>
          <TouchableOpacity
            style={styles.genBtn}
            onPress={handleGenerateNow}
            disabled={generating}
          >
            {generating
              ? <ActivityIndicator color={COLORS.background} />
              : <Text style={styles.genBtnText}>Build Mixtape</Text>
            }
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={[COLORS.cardBannerStart, COLORS.cardBannerEnd, COLORS.background]}
        style={styles.headerGradient}
      >
        <Text style={styles.headerEmoji}>🎵</Text>
        <Text style={styles.headerTitle}>Your Mixtape</Text>
        <Text style={styles.headerSub}>
          {tracks.length} track{tracks.length === 1 ? "" : "s"} for you & {otherNickname}
        </Text>
        <Text style={styles.headerNote}>Tap any track to play on your Spotify</Text>

        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.regenBtn}
            onPress={handleGenerateNow}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Text style={styles.regenBtnText}>🔄 Regenerate</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSaveToSpotify}
            disabled={savingToSpotify}
            activeOpacity={0.85}
          >
            {savingToSpotify
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>＋ Save to Spotify</Text>
            }
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={renderTrack}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1, justifyContent: "center", alignItems: "center",
    padding: 32, backgroundColor: COLORS.background,
  },
  headerGradient: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20,
    alignItems: "center", borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerEmoji: { fontSize: 36, marginBottom: 6 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 0.5 },
  headerSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  headerNote: { color: COLORS.textMuted, fontSize: 11, marginTop: 8 },
  headerActionsRow: {
    flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center",
  },
  regenBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 50,
    borderWidth: 1, borderColor: COLORS.primary + "66",
    backgroundColor: COLORS.primary + "1A",
  },
  regenBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 50,
    backgroundColor: "#1DB954",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 10,
  },
  index: {
    color: COLORS.textMuted, fontSize: 12, fontWeight: "700",
    width: 22, textAlign: "center",
  },
  cover: { width: 52, height: 52, borderRadius: 8, backgroundColor: COLORS.surfaceAlt },
  coverFallback: { justifyContent: "center", alignItems: "center" },
  coverEmoji: { fontSize: 22 },
  info: { flex: 1, gap: 3 },
  title: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700" },
  artist: { color: COLORS.textSecondary, fontSize: 12 },
  reasonChip: {
    alignSelf: "flex-start", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginTop: 2,
  },
  reasonText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary + "22",
    justifyContent: "center", alignItems: "center",
  },
  playIcon: { color: COLORS.primary, fontSize: 14 },

  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 20 },
  genBtn: {
    backgroundColor: COLORS.primary, borderRadius: 50,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  genBtnText: { color: COLORS.background, fontWeight: "bold", fontSize: 15 },
});

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@hooks/useAuth";
import { fetchUserStats } from "@services/spotify";
import { useTheme } from "@hooks/useTheme";

const TIME_RANGES = ["4 Weeks", "6 Months", "All Time"];

export default function StatsScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const BAR_COLORS = useMemo(() => ([
    [COLORS.gradientStart, COLORS.gradientEnd],
    ["#06B6D4", "#3B82F6"],
    ["#10B981", "#F59E0B"],
  ]), [COLORS]);
  const { spotifyToken } = useAuth();
  const [activeTab, setActiveTab] = useState("4 Weeks");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ artists: [], tracks: [] });

  useEffect(() => {
    const loadStats = async () => {
      if (!spotifyToken) return;
      setLoading(true);
      const data = await fetchUserStats(spotifyToken, activeTab);
      setStats(data);
      setLoading(false);
    };
    loadStats();
  }, [activeTab, spotifyToken]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Stats</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Time range tabs */}
        <View style={styles.tabContainer}>
          {TIME_RANGES.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              {activeTab === tab ? (
                <LinearGradient
                  colors={[COLORS.gradientStart + "44", COLORS.gradientEnd + "44"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.tabActiveBg}
                >
                  <Text style={[styles.tabText, styles.tabTextActive]}>{tab}</Text>
                </LinearGradient>
              ) : (
                <Text style={styles.tabText}>{tab}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏆 Top Artists</Text>
                {stats.artists.length === 0 ? (
                  <Text style={styles.emptyText}>Not enough data yet!</Text>
                ) : (
                  stats.artists.map((artist, index) => (
                    <ArtistRow key={artist.id || index} artist={artist} rank={index + 1} colorPair={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎧 Top Tracks</Text>
                {stats.tracks.length === 0 ? (
                  <Text style={styles.emptyText}>Not enough data yet!</Text>
                ) : (
                  stats.tracks.map((track, index) => (
                    <TrackRow key={track.id || index} track={track} rank={index + 1} colorPair={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function ArtistRow({ artist, rank, colorPair }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const imageUrl = artist.images?.[0]?.url;
  const popularity = artist.popularity ?? 0;

  return (
    <View style={styles.row}>
      <Text style={styles.rank}>#{rank}</Text>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.artistImg} />
      ) : (
        <View style={[styles.artistImg, styles.imgPlaceholder]}>
          <Text style={{ fontSize: 22 }}>🎤</Text>
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{artist.name}</Text>
        <View style={styles.popRow}>
          <View style={styles.popTrack}>
            <LinearGradient
              colors={colorPair}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.popFill, { width: `${popularity}%` }]}
            />
          </View>
          <Text style={styles.popLabel}>{popularity}</Text>
        </View>
        {artist.genres?.length > 0 && (
          <Text style={styles.genres} numberOfLines={1}>
            {artist.genres.slice(0, 3).join(" · ")}
          </Text>
        )}
      </View>
    </View>
  );
}

function TrackRow({ track, rank, colorPair }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const imageUrl = track.album?.images?.[0]?.url;
  const popularity = track.popularity ?? 0;
  const artistNames = track.artists?.map(a => a.name).join(", ") ?? "";

  return (
    <View style={styles.row}>
      <Text style={styles.rank}>#{rank}</Text>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.trackImg} />
      ) : (
        <View style={[styles.trackImg, styles.imgPlaceholder]}>
          <Text style={{ fontSize: 22 }}>🎵</Text>
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{track.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{artistNames}</Text>
        <View style={styles.popRow}>
          <View style={styles.popTrack}>
            <LinearGradient
              colors={colorPair}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.popFill, { width: `${popularity}%` }]}
            />
          </View>
          <Text style={styles.popLabel}>{popularity}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    marginTop: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: COLORS.textPrimary },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.surfaceAlt,
  },
  backBtnText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold" },

  tabContainer: {
    flexDirection: "row", backgroundColor: COLORS.surface,
    borderRadius: 16, padding: 4, marginBottom: 24, gap: 4,
  },
  tab: { flex: 1, borderRadius: 12, overflow: "hidden" },
  tabActiveBg: { paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center", paddingVertical: 10 },
  tabTextActive: { color: COLORS.textPrimary, fontWeight: "bold" },

  scrollContent: { paddingBottom: 40, gap: 28 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.textPrimary, marginBottom: 4 },
  emptyText: { color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", paddingVertical: 10 },

  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 12, gap: 12,
  },
  rank: { color: COLORS.primary, fontWeight: "900", fontSize: 14, width: 26, textAlign: "center" },
  artistImg: { width: 54, height: 54, borderRadius: 27 },
  trackImg: { width: 54, height: 54, borderRadius: 10 },
  imgPlaceholder: { backgroundColor: COLORS.surfaceAlt, justifyContent: "center", alignItems: "center" },
  rowInfo: { flex: 1, gap: 4 },
  rowName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "600" },
  rowSub: { color: COLORS.textMuted, fontSize: 12 },
  genres: { color: COLORS.textMuted, fontSize: 11 },

  popRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  popTrack: { flex: 1, height: 4, backgroundColor: COLORS.surfaceHigh, borderRadius: 2, overflow: "hidden" },
  popFill: { height: 4, borderRadius: 2 },
  popLabel: { color: COLORS.textMuted, fontSize: 10, width: 22, textAlign: "right" },
});

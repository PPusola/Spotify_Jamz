import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { searchTracks } from "@services/spotify";
import { useAuth } from "@hooks/useAuth";
import { useRoomContext } from "@hooks/useRoomContext";
import { useTheme } from "@hooks/useTheme";

export default function SearchScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { spotifyToken } = useAuth();
  const { broadcastRef } = useRoomContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchTracks(query, spotifyToken);
      setResults(data.tracks.items);
    } catch (e) {
      Alert.alert("Search failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTrack = async (track) => {
    setSelectedId(track.id);
    try {
      if (broadcastRef.current) {
        broadcastRef.current({
          trackUri: track.uri,
          trackName: track.name,
          artistName: track.artists.map((a) => a.name).join(", "),
          albumArt: track.album.images[0]?.url ?? null,
          isPlaying: true,
          positionMs: 0,
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
      setSelectedId(null);
    }
  };

  const durationMs = (ms) => {
    if (!ms) return "";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="Search songs, artists..."
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.85}>
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.searchBtnGradient}
          >
            <Text style={styles.searchBtnText}>Go</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
      )}

      {results.length > 0 && (
        <Text style={styles.sectionLabel}>RESULTS</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedId === item.id;
          return (
            <TouchableOpacity
              style={[styles.trackRow, isSelected && styles.trackRowSelected]}
              onPress={() => handleSelectTrack(item)}
              activeOpacity={0.75}
            >
              {item.album.images[1] ? (
                <Image source={{ uri: item.album.images[1].url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={{ fontSize: 18 }}>🎵</Text>
                </View>
              )}
              <View style={styles.trackInfo}>
                <Text style={styles.trackName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.artistName} numberOfLines={1}>
                  {item.artists.map((a) => a.name).join(", ")}
                </Text>
              </View>
              <Text style={styles.duration}>{durationMs(item.duration_ms)}</Text>
              {isSelected && (
                <View style={styles.selectedDot} />
              )}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && query.length > 0 ? (
            <Text style={styles.emptyText}>No results found.</Text>
          ) : null
        }
      />
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },

  searchRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    paddingVertical: 14,
    fontSize: 15,
  },
  searchBtn: { borderRadius: 16, overflow: "hidden" },
  searchBtnGradient: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 15 },

  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: "700",
    letterSpacing: 2, marginBottom: 12,
  },

  trackRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: 4, gap: 12,
    borderRadius: 12,
  },
  trackRowSelected: { backgroundColor: COLORS.primary + "18" },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center", alignItems: "center",
  },
  trackInfo: { flex: 1 },
  trackName: { color: COLORS.textPrimary, fontWeight: "bold", fontSize: 15, marginBottom: 3 },
  artistName: { color: COLORS.textSecondary, fontSize: 13 },
  duration: { color: COLORS.textMuted, fontSize: 12 },
  selectedDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  separator: { height: 1, backgroundColor: COLORS.surfaceAlt, marginHorizontal: 4 },
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 32, fontStyle: "italic" },
});

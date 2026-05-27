import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { getMatches, getMatchOtherProfile } from "@services/matchService";
import { createRoom } from "@services/roomService";
import { subscribeToHiddenUids } from "@services/blockService";
import { useTheme } from "@hooks/useTheme";
import { effectivePhotoUrl } from "@utils/photoVisibility";
import { liveTrack } from "@utils/nowPlaying";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";
import { MatchRowSkeleton } from "@components/Skeleton";

export default function MatchesScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [blockedSet, setBlockedSet] = useState(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeToHiddenUids(user.uid, setBlockedSet);
  }, [user?.uid]);

  const loadMatches = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const raw = await getMatches(user.uid);
      // Drop matches I've hidden (set when I deleted my account previously).
      const visible = raw.filter((m) => !m.hiddenFor?.[user.uid]);
      const withProfiles = await Promise.all(
        visible.map(async (m) => {
          const other = await getMatchOtherProfile(m, user.uid);
          if (other) return { ...m, other };
          // Other user deleted their account — keep the match visible with
          // a placeholder so the chat doesn't silently disappear.
          const otherUid = m.user1 === user.uid ? m.user2 : m.user1;
          return {
            ...m,
            other: { uid: otherUid, nickname: "Deleted account", emoji: "👻", deleted: true },
          };
        })
      );
      setMatches(withProfiles);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadMatches(); } finally { setRefreshing(false); }
  }, [loadMatches]);

  const handleJam = async (match) => {
    if (joiningId) return;
    setJoiningId(match.id);
    const displayName = profile?.nickname ?? user.uid.slice(0, 8);
    try {
      const code = await createRoom(user.uid, displayName);
      navigation.navigate("Room", { roomCode: code, isHost: true, displayName });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          <MatchRowSkeleton />
          <MatchRowSkeleton />
          <MatchRowSkeleton />
          <MatchRowSkeleton />
        </View>
      </View>
    );
  }

  const renderMatch = ({ item }) => {
    const isJamming = joiningId === item.id;
    const np = liveTrack(item.other?.nowPlaying);

    const openProfile = () => {
      if (item.other?.deleted) return;
      navigation.navigate("UserProfile", {
        profile: item.other,
        score: (item.score ?? 0) / 100,
        matchId: item.id,
        mode: "match",
      });
    };

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.tapZone} onPress={openProfile} activeOpacity={0.7}>
          <AvatarCircle
            photoUrl={effectivePhotoUrl(item.other, "chat")}
            name={item.other?.nickname}
            size={52}
          />

          <View style={styles.info}>
            <Text style={styles.nickname}>{item.other?.nickname}</Text>
            {np && (
              <Text style={styles.nowPlaying} numberOfLines={1}>
                🎧 {np.trackName}{np.artistName ? ` · ${np.artistName}` : ""}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => navigation.navigate("MatchChat", {
              matchId: item.id,
              otherNickname: item.other?.nickname,
              otherEmoji: item.other?.emoji,
              otherUid: item.other?.uid,
              otherPhotoUrl: effectivePhotoUrl(item.other, "chat"),
            })}
          >
            <Text style={styles.chatBtnText}>💬</Text>
          </TouchableOpacity>

          <GradientButton
            onPress={() => handleJam(item)}
            disabled={!!joiningId || item.other?.deleted}
            loading={isJamming}
            label="🎵 Jam"
            gradientStyle={styles.jamGradient}
            labelStyle={styles.jamLabel}
          />
        </View>
      </View>
    );
  };

  const visibleMatches = matches.filter((m) => !blockedSet.has(m.other?.uid));

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleMatches}
        keyExtractor={m => m.id}
        renderItem={renderMatch}
        contentContainerStyle={visibleMatches.length === 0 ? styles.listEmpty : styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyInList}>
            <Text style={styles.emptyEmoji}>💜</Text>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySub}>Head to Discover to find your music soulmate.</Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center" },

  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  emptyInList: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tapZone: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  info: { flex: 1 },
  nickname: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "bold" },
  nowPlaying: { color: COLORS.liveGreen, fontSize: 11, marginTop: 5 },

  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatBtn: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 50, width: 44, height: 44,
    justifyContent: "center", alignItems: "center",
  },
  chatBtnText: { fontSize: 18 },
  jamGradient: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 50 },
  jamLabel: { fontSize: 13, fontWeight: "bold" },
});

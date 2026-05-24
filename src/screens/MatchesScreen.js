import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { getMatches, getMatchOtherProfile } from "@services/matchService";
import { createRoom } from "@services/roomService";
import { useTheme } from "@hooks/useTheme";
import { matchLabel, matchColor } from "@utils/similarity";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

export default function MatchesScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);

  const loadMatches = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const raw = await getMatches(user.uid);
      const withProfiles = await Promise.all(
        raw.map(async (m) => {
          const other = await getMatchOtherProfile(m, user.uid);
          return { ...m, other };
        })
      );
      setMatches(withProfiles.filter(m => m.other));
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

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
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>💜</Text>
        <Text style={styles.emptyTitle}>No matches yet</Text>
        <Text style={styles.emptySub}>Head to Discover to find your music soulmate.</Text>
      </View>
    );
  }

  const renderMatch = ({ item }) => {
    const pct = item.score ?? 0;
    const label = matchLabel(pct / 100);
    const isJamming = joiningId === item.id;

    return (
      <View style={styles.card}>
        <AvatarCircle name={item.other?.nickname} size={52} />

        <View style={styles.info}>
          <Text style={styles.nickname}>{item.other?.nickname}</Text>
          <View style={styles.metaRow}>
            <View style={styles.pctBadge}>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
            <Text style={styles.label}>{label}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => navigation.navigate("MatchChat", {
              matchId: item.id,
              otherNickname: item.other?.nickname,
              otherEmoji: item.other?.emoji,
              otherUid: item.other?.uid,
            })}
          >
            <Text style={styles.chatBtnText}>💬</Text>
          </TouchableOpacity>

          <GradientButton
            onPress={() => handleJam(item)}
            disabled={!!joiningId}
            loading={isJamming}
            label="🎵 Jam"
            gradientStyle={styles.jamGradient}
            labelStyle={styles.jamLabel}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={matches}
        keyExtractor={m => m.id}
        renderItem={renderMatch}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onRefresh={loadMatches}
        refreshing={loading}
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  info: { flex: 1 },
  nickname: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pctBadge: {
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1, borderColor: COLORS.primary + "55",
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
  },
  pctText: { color: COLORS.primary, fontSize: 11, fontWeight: "bold" },
  label: { color: COLORS.textMuted, fontSize: 12 },

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

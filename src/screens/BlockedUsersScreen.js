import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@hooks/useAuth";
import { useTheme } from "@hooks/useTheme";
import { subscribeToBlocks, unblockUser } from "@services/blockService";
import AvatarCircle from "@components/AvatarCircle";

export default function BlockedUsersScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const [blocks, setBlocks] = useState(null); // null = loading, {} = empty
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToBlocks(user.uid, setBlocks);
    return unsub;
  }, [user?.uid]);

  const entries = useMemo(
    () => Object.entries(blocks ?? {})
      .map(([uid, v]) => ({ uid, nickname: v?.nickname || "Unknown", blockedAt: v?.blockedAt }))
      .sort((a, b) => (b.blockedAt ?? 0) - (a.blockedAt ?? 0)),
    [blocks]
  );

  const handleUnblock = (item) => {
    Alert.alert(
      `Unblock ${item.nickname}?`,
      "They'll be able to message you again and may reappear in matches and discover.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setActingId(item.uid);
            try {
              await unblockUser(user.uid, item.uid);
            } catch (e) {
              Alert.alert("Couldn't unblock", e?.message || "Unknown error");
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {blocks === null ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🚫</Text>
          <Text style={styles.emptyTitle}>No one blocked</Text>
          <Text style={styles.emptySub}>
            Users you block from a chat will appear here. You can unblock them anytime.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <AvatarCircle name={item.nickname} size={44} />
              <View style={styles.info}>
                <Text style={styles.nickname}>{item.nickname}</Text>
                <Text style={styles.sub}>
                  Blocked {formatRelative(item.blockedAt)}
                </Text>
              </View>
              {actingId === item.uid ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => handleUnblock(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.unblockText}>Unblock</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function formatRelative(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

const makeStyles = (COLORS) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLORS.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: COLORS.surface,
      justifyContent: "center", alignItems: "center",
      borderWidth: 1, borderColor: COLORS.surfaceAlt,
    },
    backBtnText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold" },
    title: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "bold" },

    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
      paddingBottom: 80,
    },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "bold", marginBottom: 8 },
    emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },

    list: { padding: 16, gap: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 14,
    },
    info: { flex: 1 },
    nickname: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "bold" },
    sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
    unblockBtn: {
      backgroundColor: COLORS.surfaceHigh,
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 20,
    },
    unblockText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  });

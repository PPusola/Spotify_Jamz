import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { subscribeToDMList, getOrCreateDM } from "@services/dmService";
import { useTheme } from "@hooks/useTheme";

export default function DMListScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToDMList(user.uid, (list) => {
      setConvos(list);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const renderItem = ({ item }) => {
    const isUnread = item.unread;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate("DMChat", {
          dmId: item.dmId,
          otherUid: item.otherUid,
          otherNickname: item.otherNickname,
          otherEmoji: item.otherEmoji,
        })}
        activeOpacity={0.75}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>{item.otherEmoji ?? "🎵"}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, isUnread && styles.nameUnread]}>{item.otherNickname}</Text>
          <Text style={[styles.lastMsg, isUnread && styles.lastMsgUnread]} numberOfLines={1}>
            {item.lastText ?? "Say hi 👋"}
          </Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
        <Text style={styles.time}>{formatTime(item.lastAt)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Messages</Text>

        {loading
          ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          : convos.length === 0
            ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>Go to Friends → message a friend to start chatting.</Text>
              </View>
            )
            : (
              <FlatList
                data={convos}
                keyExtractor={c => c.dmId}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.list}
              />
            )
        }
      </View>
    </SafeAreaView>
  );
}

function formatTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const makeStyles = (COLORS) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: "bold", color: COLORS.textPrimary, marginTop: 8, marginBottom: 20 },
  list: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: COLORS.surface, borderRadius: 16, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.surfaceAlt, justifyContent: "center", alignItems: "center" },
  avatarEmoji: { fontSize: 26 },
  info: { flex: 1 },
  name: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "600", marginBottom: 3 },
  nameUnread: { fontWeight: "bold" },
  lastMsg: { color: COLORS.textMuted, fontSize: 13 },
  lastMsgUnread: { color: COLORS.textSecondary, fontWeight: "600" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  time: { color: COLORS.textMuted, fontSize: 11 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 80 },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center" },
});

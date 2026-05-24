import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar, ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createRoom, joinRoom } from "@services/roomService";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { useTheme } from "@hooks/useTheme";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

export default function HomeScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const displayName = profile?.nickname ?? user?.uid?.slice(0, 8) ?? "Listener";

  const handleCreate = async () => {
    setLoading(true);
    try {
      const code = await createRoom(user.uid, displayName);
      navigation.navigate("Room", { roomCode: code, isHost: true, displayName });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!roomCode.trim()) {
      Alert.alert("Enter a room code to join.");
      return;
    }
    setLoading(true);
    try {
      await joinRoom(roomCode.trim().toUpperCase(), user.uid, displayName);
      navigation.navigate("Room", {
        roomCode: roomCode.trim().toUpperCase(),
        isHost: false,
        displayName,
      });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.appName}>
          <Text style={styles.appNameWhite}>Tune</Text>
          <Text style={styles.appNamePink}>Match</Text>
        </Text>
      </View>

      {/* Greeting */}
      <View style={styles.greetingRow}>
        <Text style={styles.greeting}>Hey, {displayName} 👋</Text>
        <Text style={styles.greetingSub}>Ready to jam with someone?</Text>
      </View>

      {/* Create room card */}
      <View style={styles.card}>
        <LinearGradient
          colors={[COLORS.cardBannerStart, COLORS.cardBannerEnd]}
          style={styles.createBanner}
        >
          <Text style={styles.createBannerEmoji}>🎵</Text>
          <View>
            <Text style={styles.createBannerTitle}>Host a Room</Text>
            <Text style={styles.createBannerSub}>Start a session · share the code</Text>
          </View>
        </LinearGradient>

        <GradientButton
          onPress={handleCreate}
          disabled={loading}
          loading={loading}
          label="Create a Room"
          style={styles.createBtnWrap}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or join one</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Join row */}
        <View style={styles.joinContainer}>
          <Text style={styles.joinTitle}>Enter room code</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="XXXX"
              placeholderTextColor={COLORS.textMuted}
              value={roomCode}
              onChangeText={setRoomCode}
              autoCapitalize="characters"
              maxLength={4}
              returnKeyType="go"
              onSubmitEditing={handleJoin}
            />
            <TouchableOpacity
              style={[styles.joinBtn, (!roomCode.trim() || loading) && styles.joinBtnDisabled]}
              onPress={handleJoin}
              disabled={loading || !roomCode.trim()}
              activeOpacity={0.85}
            >
              <Text style={[styles.joinBtnText, !roomCode.trim() && styles.joinBtnTextDimmed]}>
                Join →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Quick-access tiles */}
      <Text style={styles.sectionHeader}>Explore</Text>
      <View style={styles.tiles}>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate("Discover")}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.cardGradientStart, COLORS.cardGradientEnd]}
            style={styles.tileGradient}
          >
            <Text style={styles.tileEmoji}>🔥</Text>
            <Text style={styles.tileTitle}>Discover</Text>
            <Text style={styles.tileSub}>Find your music match</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate("Matches")}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.cardGradientAltStart, COLORS.cardGradientAltEnd]}
            style={styles.tileGradient}
          >
            <Text style={styles.tileEmoji}>💜</Text>
            <Text style={styles.tileTitle}>Matches</Text>
            <Text style={styles.tileSub}>Chat & jam together</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: 22, paddingTop: 60, paddingBottom: 40 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  appName: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  appNameWhite: { color: COLORS.textPrimary },
  appNamePink: { color: COLORS.primary },
  avatarBtn: {},

  greetingRow: { marginBottom: 28 },
  greeting: { fontSize: 26, fontWeight: "bold", color: COLORS.textPrimary, marginBottom: 4 },
  greetingSub: { fontSize: 14, color: COLORS.textSecondary },

  card: { backgroundColor: COLORS.surface, borderRadius: 24, overflow: "hidden", marginBottom: 28 },
  createBanner: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20 },
  createBannerEmoji: { fontSize: 36 },
  createBannerTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  createBannerSub: { color: COLORS.textSecondary, fontSize: 12 },
  createBtnWrap: { marginHorizontal: 16, marginBottom: 6 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.surfaceAlt },
  dividerText: { color: COLORS.textMuted, fontSize: 12 },

  joinContainer: { margin: 16, marginTop: 0 },
  joinTitle: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 10, fontWeight: "600", letterSpacing: 0.5 },
  joinRow: { flexDirection: "row", gap: 10 },
  codeInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceHigh,
    color: COLORS.textPrimary,
    borderRadius: 14,
    padding: 14,
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 10,
    textAlign: "center",
  },
  joinBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  joinBtnDisabled: { backgroundColor: COLORS.surfaceHigh },
  joinBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
  joinBtnTextDimmed: { color: COLORS.textMuted },

  sectionHeader: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, borderRadius: 20, overflow: "hidden" },
  tileGradient: { padding: 18, alignItems: "center", minHeight: 110, justifyContent: "center" },
  tileEmoji: { fontSize: 30, marginBottom: 8 },
  tileTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "bold", marginBottom: 4 },
  tileSub: { color: COLORS.textSecondary, fontSize: 11, textAlign: "center" },
});

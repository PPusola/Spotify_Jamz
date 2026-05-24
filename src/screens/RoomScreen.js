import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Alert,
  ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRoom } from "@hooks/useRoom";
import { useRoomContext } from "@hooks/useRoomContext";
import { useAuth } from "@hooks/useAuth";
import { subscribeToChat, sendChatMessage, rateTrack } from "@services/roomService";
import { useTheme } from "@hooks/useTheme";
import ChatPanel from "@components/ChatPanel";
import RatingModal from "@components/RatingModal";
import GradientButton from "@components/GradientButton";

const REACTIONS = ["🔥", "💜", "🎸", "🎵", "😊"];

export default function RoomScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { roomCode, isHost, displayName } = route.params;
  const { room, error, broadcastPlayback, leave } = useRoom(roomCode, isHost);
  const { broadcastRef } = useRoomContext();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("listeners");
  const [chatMessages, setChatMessages] = useState([]);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [myReaction, setMyReaction] = useState(null);

  useEffect(() => {
    broadcastRef.current = broadcastPlayback;
  }, [broadcastPlayback]);

  useEffect(() => {
    if (error) {
      Alert.alert("Room ended", error, [{ text: "OK", onPress: () => navigation.goBack() }]);
    }
  }, [error]);

  useEffect(() => {
    const unsub = subscribeToChat(roomCode, setChatMessages);
    return unsub;
  }, [roomCode]);

  const handleLeave = async () => {
    await leave();
    navigation.goBack();
  };

  const handleSendMessage = (text) => {
    if (!user) return;
    sendChatMessage(roomCode, user.uid, displayName, text).catch(console.error);
  };

  const handleRate = (rating) => {
    if (!user || !playback?.trackUri) return;
    rateTrack(user.uid, playback.trackUri, playback.trackName, playback.artistName, rating)
      .catch(console.error);
  };

  const handleReaction = (emoji) => {
    setMyReaction(prev => prev === emoji ? null : emoji);
  };

  const playback = room?.playback;
  const hasTrack = !!playback?.trackUri;
  const listeners = room?.listeners ?? {};
  const listenerCount = Object.keys(listeners).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.roomCodeWrap}>
          <View style={styles.liveDot} />
          <Text style={styles.roomCodeLabel}>ROOM </Text>
          <Text style={styles.roomCode}>{roomCode}</Text>
        </View>
        <TouchableOpacity style={styles.leaveHeaderBtn} onPress={handleLeave} activeOpacity={0.8}>
          <Text style={styles.leaveHeaderText}>{isHost ? "End" : "Leave"}</Text>
        </TouchableOpacity>
      </View>

      {/* Player card */}
      <View style={styles.playerCard}>
        {/* Album art */}
        {playback?.albumArt ? (
          <Image source={{ uri: playback.albumArt }} style={styles.albumArt} />
        ) : (
          <LinearGradient colors={[COLORS.cardBannerStart, COLORS.cardBannerEnd]} style={styles.albumArtPlaceholder}>
            <Text style={styles.albumArtEmoji}>🎵</Text>
          </LinearGradient>
        )}

        {/* Track info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackName} numberOfLines={1}>
            {hasTrack ? playback.trackName : "No track playing"}
          </Text>
          <View style={styles.artistRow}>
            <Text style={styles.artistName} numberOfLines={1}>{playback?.artistName ?? "—"}</Text>
            {hasTrack && (
              <TouchableOpacity onPress={() => setRatingVisible(true)} style={styles.heartBtn} accessibilityLabel="Rate track">
                <Text style={styles.heartEmoji}>❤️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Gradient progress bar (decorative) */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack]}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.progressFill}
            />
          </View>
        </View>

        {/* Host controls */}
        {isHost && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => broadcastPlayback({ ...playback, isPlaying: !playback?.isPlaying })}
            >
              <Text style={styles.controlBtnText}>
                {playback?.isPlaying ? "⏸" : "▶"}
              </Text>
            </TouchableOpacity>
            <GradientButton
              onPress={() => navigation.navigate("Search", { roomCode })}
              label="🔍 Pick a Song"
              style={styles.searchBtnWrap}
              gradientStyle={styles.searchGradient}
              labelStyle={styles.searchLabel}
            />
          </View>
        )}

        {/* Emoji reactions */}
        <View style={styles.reactions}>
          {REACTIONS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionBtn, myReaction === emoji && styles.reactionBtnActive]}
              onPress={() => handleReaction(emoji)}
              activeOpacity={0.75}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "listeners" && styles.tabActive]}
          onPress={() => setActiveTab("listeners")}
        >
          <Text style={[styles.tabText, activeTab === "listeners" && styles.tabTextActive]}>
            👥 Listeners ({listenerCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "chat" && styles.tabActive]}
          onPress={() => setActiveTab("chat")}
        >
          <Text style={[styles.tabText, activeTab === "chat" && styles.tabTextActive]}>
            💬 Chat
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {activeTab === "listeners" ? (
          <ScrollView contentContainerStyle={styles.listenerList}>
            {Object.entries(listeners).map(([uid, info]) => (
              <View key={uid} style={styles.listenerRow}>
                <Text style={styles.listenerEmoji}>
                  {uid === room?.hostId ? "👑" : "🎧"}
                </Text>
                <Text style={styles.listenerName}>{info.displayName}</Text>
                {uid === room?.hostId && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostBadgeText}>HOST</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <ChatPanel
            messages={chatMessages}
            currentUserId={user?.uid}
            onSend={handleSendMessage}
          />
        )}
      </View>

      <RatingModal
        visible={ratingVisible}
        trackName={playback?.trackName ?? ""}
        artistName={playback?.artistName ?? ""}
        onRate={handleRate}
        onClose={() => setRatingVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14,
  },
  roomCodeWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.liveGreen },
  roomCodeLabel: { color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5 },
  roomCode: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold", letterSpacing: 4 },
  leaveHeaderBtn: {
    backgroundColor: COLORS.error + "22",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.error + "55",
  },
  leaveHeaderText: { color: COLORS.error, fontWeight: "bold", fontSize: 13 },

  playerCard: {
    backgroundColor: COLORS.surface, borderRadius: 24,
    padding: 16, marginBottom: 14, alignItems: "center",
  },
  albumArt: { width: 120, height: 120, borderRadius: 14, marginBottom: 12 },
  albumArtPlaceholder: {
    width: 120, height: 120, borderRadius: 14, marginBottom: 12,
    justifyContent: "center", alignItems: "center",
  },
  albumArtEmoji: { fontSize: 44 },
  trackInfo: { width: "100%", alignItems: "center", marginBottom: 10 },
  trackName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  artistRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  artistName: { color: COLORS.textSecondary, fontSize: 13 },
  heartBtn: { padding: 4 },
  heartEmoji: { fontSize: 18 },

  progressWrap: { width: "100%", marginBottom: 14 },
  progressTrack: { height: 4, backgroundColor: COLORS.surfaceHigh, borderRadius: 2, overflow: "hidden" },
  progressFill: { width: "45%", height: 4, borderRadius: 2 },

  controls: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%", marginBottom: 10 },
  controlBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.primary + "55",
  },
  controlBtnText: { fontSize: 20 },
  searchBtnWrap: { flex: 1 },
  searchGradient: { paddingVertical: 13, borderRadius: 24 },
  searchLabel: { fontSize: 14, fontWeight: "bold" },

  reactions: { flexDirection: "row", gap: 8 },
  reactionBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center", alignItems: "center",
  },
  reactionBtnActive: { backgroundColor: COLORS.primary + "33", borderWidth: 1.5, borderColor: COLORS.primary + "66" },
  reactionEmoji: { fontSize: 18 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
    marginBottom: 8,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: COLORS.primary },

  tabContent: { flex: 1 },
  listenerList: { paddingVertical: 4, gap: 4 },
  listenerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  listenerEmoji: { fontSize: 18 },
  listenerName: { color: COLORS.textPrimary, fontSize: 15, flex: 1 },
  hostBadge: {
    backgroundColor: COLORS.primary + "33",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  hostBadgeText: { color: COLORS.primary, fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
});

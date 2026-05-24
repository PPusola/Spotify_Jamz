import React, { useState, useMemo } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@hooks/useTheme";

export default function ChatPanel({ messages, currentUserId, onSend }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View style={styles.container}>
      <FlatList
        inverted
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMine = item.uid === currentUserId;
          return (
            <View style={[styles.bubbleWrap, isMine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
              {!isMine && (
                <Text style={styles.sender}>{item.displayName}</Text>
              )}
              {isMine ? (
                <LinearGradient
                  colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.bubble, styles.bubbleMine]}
                >
                  <Text style={styles.msgTextMine}>{item.text}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.bubbleTheirs]}>
                  <Text style={styles.msgText}>{item.text}</Text>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No messages yet. Say hi 👋</Text>
        }
      />
      <View style={styles.inputRow}>
        <Text style={styles.musicIcon}>🎵</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message..."
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSend}
          activeOpacity={0.85}
          style={styles.sendBtnWrap}
        >
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientEnd]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.sendBtn}
          >
            <Text style={styles.sendArrow}>→</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 4, paddingBottom: 8 },

  bubbleWrap: { marginBottom: 8, maxWidth: "80%" },
  bubbleWrapMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleWrapTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },

  sender: { color: COLORS.textMuted, fontSize: 11, marginBottom: 3, marginLeft: 2 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: {},
  bubbleTheirs: { backgroundColor: COLORS.surface },
  msgText: { color: COLORS.textPrimary, fontSize: 14 },
  msgTextMine: { color: "#FFFFFF", fontSize: 14 },

  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceAlt,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 10,
    gap: 8,
  },
  musicIcon: { fontSize: 18 },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  sendBtnWrap: { borderRadius: 22, overflow: "hidden" },
  sendBtn: {
    width: 42, height: 42,
    justifyContent: "center", alignItems: "center",
  },
  sendArrow: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
});

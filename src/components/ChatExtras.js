import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Animated, Easing, ScrollView,
  Modal, TouchableOpacity, TouchableWithoutFeedback,
} from "react-native";
import { useTheme } from "@hooks/useTheme";

export const REACTION_EMOJIS = ["❤️", "😂", "🔥", "👍", "😮", "🎵"];

// Expanded set shown after the user taps "+". Kept loosely grouped:
// faces · hands · hearts · music · misc.
export const EXTRA_EMOJIS = [
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💔",
  "😂", "🤣", "😭", "🥺", "😍", "🥰", "😎", "🤩", "🥹", "😅",
  "😴", "🤔", "🤯", "🫠", "🫡", "😡", "😱", "😬", "🙄", "😏",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👀", "🫶", "🤌",
  "🔥", "💯", "✨", "⭐", "💫", "🎉", "🎊", "🥂", "🍻", "🎁",
  "🎵", "🎶", "🎤", "🎧", "🎸", "🥁", "🎹", "🎺", "🎷", "🪕",
];

// ─── Typing dots ─────────────────────────────────────────────────────────────

/**
 * Three bouncing dots used as a typing indicator. Driven by a single Animated
 * value with phase-shifted interpolations so all three dots share one loop.
 */
export function TypingDots({ color }) {
  const COLORS = useTheme();
  const dotColor = color ?? COLORS.textMuted;
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1, duration: 1100,
        easing: Easing.linear, useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const dot = (phase) => {
    const translateY = t.interpolate({
      inputRange: [0, 0.33, 0.66, 1].map((v) => (v + phase) % 1).sort((a, b) => a - b),
      outputRange: [0, -4, 0, 0],
    });
    return (
      <Animated.View
        style={[
          dotStyles.dot,
          { backgroundColor: dotColor, transform: [{ translateY }] },
        ]}
      />
    );
  };

  return (
    <View style={dotStyles.row}>
      {dot(0)}
      {dot(0.15)}
      {dot(0.3)}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

// ─── Date separator ──────────────────────────────────────────────────────────

export function DateSeparator({ label }) {
  const COLORS = useTheme();
  const styles = useMemo(() => sepStyles(COLORS), [COLORS]);
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const sepStyles = (COLORS) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginVertical: 12,
      paddingHorizontal: 8,
    },
    line: { flex: 1, height: 1, backgroundColor: COLORS.surfaceAlt },
    label: {
      color: COLORS.textMuted,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.5,
    },
  });

// ─── Read receipt ────────────────────────────────────────────────────────────

/**
 * Single ✓ for sent, double ✓✓ for read. Only rendered on the user's own
 * messages — callers gate on `isMe`.
 */
export function ReadReceipt({ isRead }) {
  const COLORS = useTheme();
  return (
    <Text
      style={{
        color: isRead ? COLORS.liveGreen : COLORS.textMuted + "99",
        fontSize: 11,
        marginLeft: 4,
      }}
    >
      {isRead ? "✓✓" : "✓"}
    </Text>
  );
}

// ─── Reaction badges (rendered under a message bubble) ───────────────────────

export function ReactionBadges({ reactions, onPress }) {
  const COLORS = useTheme();
  const styles = useMemo(() => badgeStyles(COLORS), [COLORS]);
  // reactions is { uid: emoji }. Group counts per emoji.
  const counts = {};
  for (const emoji of Object.values(reactions || {})) {
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  return (
    <View style={styles.row}>
      {entries.map(([emoji, count]) => (
        <TouchableOpacity
          key={emoji}
          style={styles.badge}
          onPress={() => onPress?.(emoji)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 1 && <Text style={styles.count}>{count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const badgeStyles = (COLORS) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap" },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: COLORS.surfaceHigh,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    emoji: { fontSize: 13 },
    count: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600" },
  });

// ─── Reaction picker modal ───────────────────────────────────────────────────

export function ReactionPicker({ visible, onSelect, onClose, currentReaction }) {
  const COLORS = useTheme();
  const styles = useMemo(() => pickerStyles(COLORS), [COLORS]);
  const [expanded, setExpanded] = useState(false);

  // Reset to the compact bar whenever the picker is reopened
  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            {expanded ? (
              <View style={styles.gridCard}>
                <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
                  {EXTRA_EMOJIS.map((emoji) => {
                    const isActive = emoji === currentReaction;
                    return (
                      <TouchableOpacity
                        key={emoji}
                        onPress={() => onSelect(isActive ? null : emoji)}
                        style={[styles.emojiBtn, isActive && styles.emojiBtnActive]}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.emoji}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.bar}>
                {REACTION_EMOJIS.map((emoji) => {
                  const isActive = emoji === currentReaction;
                  return (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => onSelect(isActive ? null : emoji)}
                      style={[styles.emojiBtn, isActive && styles.emojiBtnActive]}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.emoji}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => setExpanded(true)}
                  style={[styles.emojiBtn, styles.plusBtn]}
                  activeOpacity={0.6}
                  accessibilityLabel="More emojis"
                >
                  <Text style={styles.plusText}>+</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const pickerStyles = (COLORS) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    bar: {
      flexDirection: "row",
      backgroundColor: COLORS.surface,
      borderRadius: 32,
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 4,
    },
    emojiBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    emojiBtnActive: { backgroundColor: COLORS.surfaceHigh },
    emoji: { fontSize: 26 },

    plusBtn: { backgroundColor: COLORS.surfaceHigh },
    plusText: { color: COLORS.textSecondary, fontSize: 22, fontWeight: "700" },

    gridCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 24,
      padding: 12,
      maxHeight: 320,
      width: "100%",
      maxWidth: 360,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      justifyContent: "center",
    },
  });

// ─── Date-grouping helper ────────────────────────────────────────────────────

/**
 * Walk messages (sorted ascending by sentAt) and insert synthetic
 * { type: "date", id, label } items between groups of different days.
 * Returns the full list — message items get `type: "message"`.
 */
export function groupMessagesByDate(messages) {
  if (!messages?.length) return [];
  const out = [];
  let lastDayKey = null;
  for (const m of messages) {
    const d = new Date(m.sentAt ?? 0);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dayKey !== lastDayKey) {
      out.push({ type: "date", id: `date-${dayKey}`, label: formatDayLabel(d) });
      lastDayKey = dayKey;
    }
    out.push({ ...m, type: "message" });
  }
  return out;
}

function formatDayLabel(d) {
  const now = new Date();
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";

  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  if (d >= weekAgo) {
    return d.toLocaleDateString([], { weekday: "long" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

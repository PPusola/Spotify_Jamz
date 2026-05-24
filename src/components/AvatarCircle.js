import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@hooks/useTheme";

const PALETTE = [
  "#E91E8C", "#7B5CF5", "#06B6D4", "#F59E0B",
  "#10B981", "#EF4444", "#8B5CF6", "#3B82F6",
];

/** Returns a deterministic color from the palette based on a string seed */
export function getAvatarColor(seed) {
  if (!seed) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Returns up to 2 initials from a name string */
export function getInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Circular avatar showing initials with auto-generated background colour.
 *
 * Props:
 *   name          – used for initials and colour seed
 *   size          – diameter in dp (default 48)
 *   useGradient   – if true, applies pink→purple gradient background
 *   color         – override background colour (ignored when useGradient)
 *   fontSize      – override initials font size (default size * 0.36)
 *   style         – extra container style
 */
export default function AvatarCircle({
  name,
  size = 48,
  useGradient = false,
  color,
  fontSize,
  style,
}) {
  const COLORS = useTheme();
  const initials = getInitials(name);
  const bgColor = color ?? getAvatarColor(name);
  const fSize = fontSize ?? Math.round(size * 0.36);
  const radius = size / 2;

  const textEl = (
    <Text style={[styles.initials, { fontSize: fSize }]}>{initials}</Text>
  );

  if (useGradient) {
    return (
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ width: size, height: size, borderRadius: radius, justifyContent: "center", alignItems: "center" }, style]}
      >
        {textEl}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: bgColor, justifyContent: "center", alignItems: "center" }, style]}
    >
      {textEl}
    </View>
  );
}

const styles = StyleSheet.create({
  initials: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});

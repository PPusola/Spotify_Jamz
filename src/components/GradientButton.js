import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@hooks/useTheme";

/**
 * A pink→purple gradient CTA button.
 *
 * Props:
 *   onPress       – handler
 *   disabled      – dims + flattens gradient
 *   loading       – shows ActivityIndicator instead of label
 *   label         – text label (used when children is omitted)
 *   children      – arbitrary content rendered inside gradient
 *   colors        – override gradient array (default pink→purple)
 *   style         – TouchableOpacity outer container style
 *   gradientStyle – extra style applied to the LinearGradient view
 *   labelStyle    – extra style applied to the label Text
 */
export default function GradientButton({
  onPress,
  disabled,
  loading,
  label,
  children,
  colors,
  style,
  gradientStyle,
  labelStyle,
}) {
  const COLORS = useTheme();
  const gradColors = disabled
    ? ["#3A3A5A", "#3A3A5A"]
    : (colors ?? [COLORS.gradientStart, COLORS.gradientEnd]);

  const content = loading ? (
    <ActivityIndicator color="#fff" size="small" />
  ) : typeof children === "string" || !children ? (
    <Text style={[styles.label, labelStyle]}>{children ?? label}</Text>
  ) : (
    children
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={style}
    >
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, gradientStyle]}
      >
        {content}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
  },
});

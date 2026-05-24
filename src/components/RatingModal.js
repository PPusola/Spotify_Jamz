import React, { useState, useEffect, useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@hooks/useTheme";
import GradientButton from "@components/GradientButton";

export default function RatingModal({ visible, trackName, artistName, onRate, onClose }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const [rating, setRating] = useState(5);

  useEffect(() => {
    if (visible) setRating(5);
  }, [visible, trackName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.label}>RATE THIS TRACK</Text>
          <Text style={styles.trackName} numberOfLines={1}>{trackName}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{artistName}</Text>

          <View style={styles.pipsRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} style={styles.pipWrapper} activeOpacity={0.7}>
                {n <= rating ? (
                  <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.pip, styles.pipFilled]}
                  />
                ) : (
                  <View style={styles.pip} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.ratingValue}>
            <Text style={styles.ratingNum}>{rating}</Text>
            <Text style={styles.ratingDen}> / 10</Text>
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <GradientButton
              onPress={() => { onRate(rating); onClose(); }}
              label="Rate ❤️"
              style={styles.rateBtnWrap}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
    alignItems: "center",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.surfaceHigh,
    marginBottom: 24,
  },
  label: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 2,
    fontWeight: "700", marginBottom: 12,
  },
  trackName: {
    color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold",
    textAlign: "center", marginBottom: 4,
  },
  artistName: {
    color: COLORS.textSecondary, fontSize: 14,
    textAlign: "center", marginBottom: 28,
  },

  pipsRow: { flexDirection: "row", gap: 5, marginBottom: 16 },
  pipWrapper: { padding: 4 },
  pip: {
    width: 22, height: 22, borderRadius: 5,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1.5, borderColor: COLORS.surfaceAlt,
  },
  pipFilled: { borderColor: "transparent" },

  ratingValue: { marginBottom: 28 },
  ratingNum: { color: COLORS.primary, fontSize: 32, fontWeight: "900" },
  ratingDen: { color: COLORS.textMuted, fontSize: 20, fontWeight: "600" },

  btnRow: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5, borderColor: COLORS.surfaceHigh,
    borderRadius: 50, padding: 15,
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { color: COLORS.textSecondary, fontWeight: "bold", fontSize: 15 },
  rateBtnWrap: { flex: 1 },
});

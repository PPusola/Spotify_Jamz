import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { useTheme } from "@hooks/useTheme";

/**
 * Pulsing rectangle used as a layout-shaped loading placeholder.
 *
 * Single animation driver (opacity, native-driven) so dozens of skeletons
 * on screen don't tank the frame rate.
 */
export function Skeleton({ width, height, borderRadius = 8, style }) {
  const COLORS = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: COLORS.surfaceHigh, opacity },
        style,
      ]}
    />
  );
}

/**
 * Match card placeholder — matches the layout of a real MatchesScreen card.
 */
export function MatchRowSkeleton() {
  const COLORS = useTheme();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.matchRow}>
      <Skeleton width={52} height={52} borderRadius={26} />
      <View style={styles.matchInfo}>
        <Skeleton width="60%" height={14} />
        <View style={{ height: 8 }} />
        <Skeleton width="40%" height={10} />
      </View>
      <Skeleton width={44} height={44} borderRadius={22} />
      <Skeleton width={64} height={36} borderRadius={18} />
    </View>
  );
}

/**
 * DM list row placeholder.
 */
export function DMRowSkeleton() {
  const COLORS = useTheme();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.dmRow}>
      <Skeleton width={50} height={50} borderRadius={25} />
      <View style={styles.dmInfo}>
        <Skeleton width="45%" height={13} />
        <View style={{ height: 8 }} />
        <Skeleton width="80%" height={11} />
      </View>
      <Skeleton width={36} height={10} />
    </View>
  );
}

/**
 * Generic user row (Friends search / friends list).
 */
export function UserRowSkeleton() {
  const COLORS = useTheme();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.userRow}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.userInfo}>
        <Skeleton width="55%" height={13} />
      </View>
      <Skeleton width={72} height={32} borderRadius={16} />
    </View>
  );
}

/**
 * Mixtape track row placeholder.
 */
export function TrackRowSkeleton() {
  const COLORS = useTheme();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.trackRow}>
      <Skeleton width={48} height={48} borderRadius={6} />
      <View style={styles.trackInfo}>
        <Skeleton width="70%" height={13} />
        <View style={{ height: 6 }} />
        <Skeleton width="45%" height={11} />
        <View style={{ height: 8 }} />
        <Skeleton width={90} height={18} borderRadius={9} />
      </View>
    </View>
  );
}

/**
 * Discover full-card placeholder mirroring the card shape.
 */
export function DiscoverCardSkeleton() {
  const COLORS = useTheme();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.discoverCard}>
      <Skeleton width="100%" height="48%" borderRadius={0} />
      <View style={styles.discoverBody}>
        <View style={styles.discoverNameRow}>
          <Skeleton width={140} height={20} />
          <Skeleton width={56} height={24} borderRadius={12} />
        </View>
        <View style={{ height: 14 }} />
        <Skeleton width="35%" height={10} />
        <View style={{ height: 8 }} />
        <Skeleton width="100%" height={5} borderRadius={3} />
        <View style={{ height: 18 }} />
        <Skeleton width={120} height={9} />
        <View style={{ height: 8 }} />
        <View style={styles.chipRow}>
          <Skeleton width={70} height={26} borderRadius={13} />
          <Skeleton width={90} height={26} borderRadius={13} />
          <Skeleton width={60} height={26} borderRadius={13} />
        </View>
        <View style={{ height: 18 }} />
        <View style={styles.chipRow}>
          <Skeleton width={64} height={24} borderRadius={12} />
          <Skeleton width={80} height={24} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (COLORS) =>
  StyleSheet.create({
    matchRow: {
      backgroundColor: COLORS.surface,
      borderRadius: 20,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    matchInfo: { flex: 1 },

    dmRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      gap: 14,
    },
    dmInfo: { flex: 1 },

    userRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 14,
      gap: 12,
    },
    userInfo: { flex: 1 },

    trackRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 12,
      gap: 12,
    },
    trackInfo: { flex: 1 },

    discoverCard: {
      flex: 1,
      backgroundColor: COLORS.surface,
      borderRadius: 28,
      overflow: "hidden",
    },
    discoverBody: { flex: 1, padding: 20, paddingTop: 16 },
    discoverNameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    chipRow: { flexDirection: "row", gap: 8 },
  });

export default Skeleton;

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, Animated, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { getPublicUsers, getAlreadySeen, likeUser, passUser } from "@services/matchService";
import { generateAndSaveMixtape } from "@services/mixtapeService";
import { getVibe, matchLabel, matchColor } from "@utils/similarity";
import { mlScoreCandidates } from "@utils/mlCompatibility";
import { useTheme } from "@hooks/useTheme";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

const { width: SW } = Dimensions.get("window");
const SWIPE_THRESHOLD = SW * 0.28;

function GradientBar({ progress, height = 5, style }) {
  const COLORS = useTheme();
  const w = `${Math.min(100, Math.max(0, progress * 100))}%`;
  return (
    <View style={[{ height, backgroundColor: COLORS.surfaceHigh, borderRadius: height / 2, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ width: w, height, borderRadius: height / 2 }}
      />
    </View>
  );
}

export default function DiscoverScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user, spotifyToken } = useAuth();
  const { profile } = useProfile();

  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [matchModal, setMatchModal] = useState(null);

  const position = useRef(new Animated.ValueXY()).current;

  const rotate = position.x.interpolate({
    inputRange: [-SW / 2, 0, SW / 2],
    outputRange: ["-18deg", "0deg", "18deg"],
    extrapolate: "clamp",
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [20, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const passOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -20],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const nextScale = position.x.interpolate({
    inputRange: [-SW, 0, SW],
    outputRange: [1, 0.93, 1],
    extrapolate: "clamp",
  });

  const loadCards = useCallback(async () => {
    if (!user?.uid || !profile) return;
    setLoading(true);
    try {
      const [users, seen] = await Promise.all([
        getPublicUsers(user.uid),
        getAlreadySeen(user.uid),
      ]);
      const unseen = users.filter(u => !seen.has(u.uid));
      // ML-based compatibility: vectorize all users, K-Means cluster them,
      // then rank by cosine similarity + same-cluster boost.
      const scored = mlScoreCandidates(profile, unseen);
      setCards(scored);
      setIndex(0);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, profile]);

  useEffect(() => { loadCards(); }, [loadCards]);

  const current = cards[index];
  const next = cards[index + 1];

  const doLike = useCallback(async (card) => {
    setActing(true);
    try {
      const mid = await likeUser(user.uid, card.uid, card.score);
      if (mid) {
        // Fire-and-forget mixtape generation. MixtapeScreen polls until it shows up.
        generateAndSaveMixtape(mid, user.uid, card.uid, spotifyToken).catch(
          (e) => console.warn("Mixtape generation failed:", e?.message)
        );
        setMatchModal({ mid, other: card });
      } else {
        setIndex(i => i + 1);
      }
    } finally {
      setActing(false);
    }
  }, [user.uid, spotifyToken]);

  const doPass = useCallback(async (card) => {
    setActing(true);
    try {
      await passUser(user.uid, card.uid);
      setIndex(i => i + 1);
    } finally {
      setActing(false);
    }
  }, [user.uid]);

  const flyOff = (direction, onDone) => {
    Animated.timing(position, {
      toValue: { x: direction * SW * 1.5, y: 0 },
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      onDone();
    });
  };

  const snapBack = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: position.x, translationY: position.y } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state !== State.END || !current || acting) return;
    if (nativeEvent.translationX > SWIPE_THRESHOLD) {
      flyOff(1, () => doLike(current));
    } else if (nativeEvent.translationX < -SWIPE_THRESHOLD) {
      flyOff(-1, () => doPass(current));
    } else {
      snapBack();
    }
  };

  const handleLikeBtn = () => {
    if (!current || acting) return;
    flyOff(1, () => doLike(current));
  };

  const handlePassBtn = () => {
    if (!current || acting) return;
    flyOff(-1, () => doPass(current));
  };

  const handleMatchContinue = () => {
    const { mid, other } = matchModal;
    setMatchModal(null);
    setIndex(i => i + 1);
    navigation.navigate("MatchChat", {
      matchId: mid,
      otherNickname: other.nickname,
      otherEmoji: other.emoji,
      otherUid: other.uid,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🎵</Text>
        <Text style={styles.emptyTitle}>You're all caught up</Text>
        <Text style={styles.emptySub}>No more profiles right now.</Text>
        <GradientButton onPress={loadCards} label="Refresh" style={styles.refreshBtnWrap} gradientStyle={styles.refreshGradient} />
      </View>
    );
  }

  const pct = Math.round(current.score * 100);
  const vibe = getVibe(current.topGenres);

  return (
    <View style={styles.container}>

      {/* Card stack */}
      <View style={styles.stack}>
        {next && (
          <Animated.View style={[styles.card, styles.cardBehind, { transform: [{ scale: nextScale }] }]}>
            <CardContent card={next} />
          </Animated.View>
        )}

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          enabled={!acting}
        >
          <Animated.View style={[
            styles.card,
            { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
          ]}>
            {/* LIKE stamp */}
            <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
              <Text style={styles.stampLikeText}>LIKE</Text>
            </Animated.View>
            {/* PASS stamp */}
            <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]}>
              <Text style={styles.stampPassText}>PASS</Text>
            </Animated.View>

            <CardContent card={current} vibe={vibe} score={current.score} />
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.passBtn} onPress={handlePassBtn} disabled={acting} activeOpacity={0.8}>
          <Text style={styles.passBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.counterWrap}>
          <Text style={styles.counter}>{index + 1} / {cards.length}</Text>
        </View>

        <GradientButton
          onPress={handleLikeBtn}
          disabled={acting}
          style={styles.likeBtnWrap}
          gradientStyle={styles.likeBtnGradient}
        >
          {acting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.likeIcon}>♥</Text>
          }
        </GradientButton>
      </View>

      {/* Match modal */}
      <Modal visible={!!matchModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient colors={[COLORS.cardBannerStart, COLORS.cardBannerEnd]} style={styles.modalCard}>
            <Text style={styles.modalSparkle}>🎉</Text>
            <Text style={styles.matchTitle}>It's a Match!</Text>
            <Text style={styles.matchSub}>
              You and {matchModal?.other?.nickname} are musically in sync
            </Text>

            <View style={styles.matchAvatars}>
              <AvatarCircle name={profile?.nickname} size={68} />
              <Text style={styles.heartEmoji}>❤️</Text>
              <AvatarCircle name={matchModal?.other?.nickname} size={68} />
            </View>

            <View style={styles.matchPctWrap}>
              <Text style={styles.matchPctBig}>
                {Math.round((matchModal?.other?.score ?? 0) * 100)}%
              </Text>
              <Text style={styles.matchPctLabel}>music compatibility score</Text>
            </View>

            <GradientButton
              onPress={handleMatchContinue}
              label="💬 Start Chatting"
              style={styles.chatBtnWrap}
            />
            <TouchableOpacity onPress={() => { setMatchModal(null); setIndex(i => i + 1); }} style={{ marginTop: 14 }}>
              <Text style={styles.keepGoing}>Keep Discovering</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
}

function CardContent({ card, vibe, score }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const toArr = v => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);
  const genres = toArr(card.topGenres).slice(0, 4);
  const artists = toArr(card.topArtists).slice(0, 4);
  const pct = score !== undefined ? Math.round(score * 100) : Math.round((card.score || 0) * 100);

  return (
    <View style={styles.cardInner}>
      {/* Gradient header section */}
      <LinearGradient
        colors={[COLORS.cardBannerStart, COLORS.cardBannerEnd, COLORS.background]}
        style={styles.cardHeader}
      >
        {vibe && (
          <View style={styles.vibeTopPill}>
            <Text style={styles.vibeTopText}>🌙 {vibe}</Text>
          </View>
        )}
        <AvatarCircle name={card.nickname} size={96} useGradient style={styles.cardAvatar} />
      </LinearGradient>

      {/* Body info */}
      <View style={styles.cardBody}>
        <View style={styles.nameCompatRow}>
          <Text style={styles.cardNickname}>{card.nickname}</Text>
          {pct > 0 && (
            <View style={styles.compatBadge}>
              <Text style={styles.compatBadgeText}>{pct}%</Text>
            </View>
          )}
        </View>

        {pct > 0 && (
          <View style={styles.compatSection}>
            <Text style={styles.compatLabel}>🎵 Music compatibility</Text>
            <GradientBar progress={pct / 100} style={{ marginTop: 6 }} />
          </View>
        )}

        {artists.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SHARED ARTISTS</Text>
            <View style={styles.chips}>
              {artists.map(a => (
                <View key={a} style={styles.chip}>
                  <Text style={styles.chipText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {genres.length > 0 && (
          <View style={styles.chips}>
            {genres.map(g => (
              <View key={g} style={[styles.chip, styles.genreChip]}>
                <Text style={styles.genreChipText}>{g}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  centered: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: 32 },

  stack: { flex: 1, position: "relative" },
  card: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.surface, borderRadius: 28, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cardBehind: { top: 12, left: 8, right: 8 },

  cardInner: { flex: 1 },
  cardHeader: {
    height: "48%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 16,
  },
  vibeTopPill: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  vibeTopText: { color: COLORS.textSecondary, fontSize: 12 },
  cardAvatar: { marginTop: 8 },

  cardBody: { flex: 1, padding: 20, paddingTop: 16 },
  nameCompatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardNickname: { color: COLORS.textPrimary, fontSize: 22, fontWeight: "bold" },
  compatBadge: {
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1, borderColor: COLORS.primary + "55",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
  },
  compatBadgeText: { color: COLORS.primary, fontSize: 13, fontWeight: "bold" },

  compatSection: { marginBottom: 12 },
  compatLabel: { color: COLORS.textMuted, fontSize: 11 },

  stamp: {
    position: "absolute", top: 40, zIndex: 10,
    borderWidth: 3, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
  },
  stampLike: { right: 24, borderColor: COLORS.liveGreen, transform: [{ rotate: "15deg" }] },
  stampLikeText: { color: COLORS.liveGreen, fontSize: 24, fontWeight: "900", letterSpacing: 3 },
  stampPass: { left: 24, borderColor: COLORS.error, transform: [{ rotate: "-15deg" }] },
  stampPassText: { color: COLORS.error, fontSize: 24, fontWeight: "900", letterSpacing: 3 },

  section: { marginBottom: 12 },
  sectionLabel: { color: COLORS.textMuted, fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5,
  },
  chipText: { color: COLORS.textSecondary, fontSize: 12 },
  genreChip: { backgroundColor: COLORS.secondary + "22", borderWidth: 1, borderColor: COLORS.secondary + "44" },
  genreChipText: { color: COLORS.secondary, fontSize: 12 },

  actions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingTop: 12 },
  passBtn: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.surfaceAlt,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  passBtnText: { color: COLORS.textMuted, fontSize: 22, fontWeight: "bold" },
  counterWrap: { alignItems: "center" },
  counter: { color: COLORS.textMuted, fontSize: 12 },
  likeBtnWrap: {},
  likeBtnGradient: { width: 68, height: 68, borderRadius: 34, paddingVertical: 0, paddingHorizontal: 0 },
  likeIcon: { color: "#FFFFFF", fontSize: 26 },

  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 28 },
  refreshBtnWrap: {},
  refreshGradient: { paddingHorizontal: 36, paddingVertical: 14 },

  // Match modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { borderRadius: 32, padding: 32, width: "100%", alignItems: "center" },
  modalSparkle: { fontSize: 40, marginBottom: 8 },
  matchTitle: { color: COLORS.textPrimary, fontSize: 28, fontWeight: "900", marginBottom: 8 },
  matchSub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 28 },
  matchAvatars: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  heartEmoji: { fontSize: 28 },
  matchPctWrap: { alignItems: "center", marginBottom: 28 },
  matchPctBig: { color: COLORS.primary, fontSize: 52, fontWeight: "900", letterSpacing: -2 },
  matchPctLabel: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  chatBtnWrap: { width: "100%" },
  keepGoing: { color: COLORS.textSecondary, fontSize: 14 },
});

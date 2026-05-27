import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Image, Alert,
} from "react-native";
import { createProfile } from "@services/userService";
import { useAuth } from "@hooks/useAuth";
import { useTheme } from "@hooks/useTheme";

const EMOJI_OPTIONS = [
  "🎵","🎧","🎸","🎹","🎺","🎻","🥁","🎤",
  "🦁","🐯","🐻","🦊","🐺","🦋","🐙","🦄",
  "🔥","⚡","🌊","🌙","⭐","🌈","❄️","🎯",
  "👾","🤖","👽","💀","🧠","👁️","🫀","🎭",
];

export default function ProfileSetupScreen({ navigation, route }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const spotifyProfile = route.params?.spotifyProfile;

  const [nickname, setNickname] = useState(
    spotifyProfile?.display_name?.split(" ")[0] ?? ""
  );
  const [selectedEmoji, setSelectedEmoji] = useState("🎵");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nickname.trim()) {
      Alert.alert("Pick a nickname", "Your nickname can't be empty.");
      return;
    }
    if (nickname.trim().length < 2) {
      Alert.alert("Too short", "Nickname must be at least 2 characters.");
      return;
    }

    setSaving(true);
    try {
      await createProfile(user.uid, {
        spotifyId: user.spotifyId ?? spotifyProfile?.id ?? null,
        nickname: nickname.trim(),
        emoji: selectedEmoji,
        isPublic,
        spotifyDisplayName: spotifyProfile?.display_name ?? null,
        spotifyPfp: spotifyProfile?.images?.[0]?.url ?? null,
        useSpotifyPhoto: true,
        showPhotoInDiscover: true,
        followerCount: spotifyProfile?.followers?.total ?? 0,
        topArtists: (route.params?.topArtists ?? []).filter(Boolean),
        topGenres: (route.params?.topGenres ?? []).filter(Boolean),
        topTracks: (route.params?.topTracks ?? []).filter(Boolean),
      });

      route.params?.onProfileCreated?.();
    } catch (e) {
      Alert.alert("Error", "Could not save profile: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <Text style={styles.title}>Create your profile</Text>
      <Text style={styles.subtitle}>
        This is how other listeners will see you in rooms.
      </Text>

      {/* Avatar preview card */}
      <View style={styles.avatarCard}>
        {spotifyProfile?.images?.[0]?.url ? (
          <Image
            source={{ uri: spotifyProfile.images[0].url }}
            style={styles.spotifyPfp}
          />
        ) : null}
        <View style={styles.emojiPreview}>
          <Text style={styles.emojiPreviewText}>{selectedEmoji}</Text>
        </View>
        <Text style={styles.previewNickname}>
          {nickname.trim() || "Your nickname"}
        </Text>
        <View style={[styles.badge, isPublic ? styles.badgePublic : styles.badgePrivate]}>
          <Text style={styles.badgeText}>
            {isPublic ? "Public" : "Private"}
          </Text>
        </View>
      </View>

      {/* Emoji picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PICK YOUR AVATAR</Text>
        <View style={styles.emojiGrid}>
          {EMOJI_OPTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.emojiOption,
                selectedEmoji === emoji && styles.emojiOptionSelected,
              ]}
              onPress={() => setSelectedEmoji(emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.emojiOptionText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Nickname */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>YOUR NICKNAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. CoolDude, MusicLover"
          placeholderTextColor={COLORS.textMuted}
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          autoCapitalize="none"
        />
        <Text style={styles.charCount}>{nickname.length}/20</Text>
      </View>

      {/* Spotify data preview */}
      {spotifyProfile && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FROM YOUR SPOTIFY</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Account" value={spotifyProfile.display_name} />
            {spotifyProfile.followers?.total > 0 && (
              <InfoRow
                label="Followers"
                value={spotifyProfile.followers.total.toLocaleString()}
              />
            )}
            {route.params?.topArtists?.length > 0 && (
              <InfoRow
                label="Top artists"
                value={route.params.topArtists.slice(0, 3).join(", ")}
              />
            )}
            {route.params?.topGenres?.length > 0 && (
              <InfoRow
                label="Top genres"
                value={route.params.topGenres.slice(0, 3).join(", ")}
              />
            )}
            <View style={styles.privacyPill}>
              <Text style={styles.privacyPillText}>
                Stored privately · never shown to others
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Public / Private toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>VISIBILITY</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <Text style={styles.toggleLabel}>
              {isPublic ? "Public profile" : "Private profile"}
            </Text>
            <Text style={styles.toggleSubLabel}>
              {isPublic
                ? "Anyone can find and add you"
                : "Only room members can add you"}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: COLORS.surfaceAlt, true: COLORS.primary }}
            thumbColor={COLORS.textPrimary}
          />
        </View>
        {/* Quick toggle pills */}
        <View style={styles.pillRow}>
          <TouchableOpacity
            style={[styles.pill, isPublic && styles.pillActive]}
            onPress={() => setIsPublic(true)}
          >
            <Text style={[styles.pillText, isPublic && styles.pillTextActive]}>
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, !isPublic && styles.pillActive]}
            onPress={() => setIsPublic(false)}
          >
            <Text style={[styles.pillText, !isPublic && styles.pillTextActive]}>
              Private
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.background} />
        ) : (
          <Text style={styles.saveBtnText}>Let's Jam</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footerNote}>
        You can update your profile anytime from settings.
      </Text>

    </ScrollView>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (COLORS) => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 24,
    paddingBottom: 56,
    alignItems: "center",
  },

  // ── Header
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: "center",
    marginTop: 48,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 32,
  },

  // ── Avatar preview card
  avatarCard: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  spotifyPfp: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  emojiPreview: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  emojiPreviewText: {
    fontSize: 44,
  },
  previewNickname: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgePublic: {
    backgroundColor: COLORS.primary + "33",
  },
  badgePrivate: {
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // ── Sections
  section: {
    width: "100%",
    marginBottom: 28,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    fontWeight: "600",
  },

  // ── Emoji grid
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiOption: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  emojiOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceAlt,
  },
  emojiOptionText: {
    fontSize: 26,
  },

  // ── Nickname input
  input: {
    width: "100%",
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  charCount: {
    alignSelf: "flex-end",
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 6,
  },

  // ── Spotify info card
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoRowLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  infoRowValue: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  privacyPill: {
    marginTop: 4,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  privacyPillText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },

  // ── Toggle
  toggleCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  toggleLeft: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  toggleSubLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  pillRow: {
    flexDirection: "row",
    gap: 10,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  pillActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceAlt,
  },
  pillText: {
    color: COLORS.textMuted,
    fontWeight: "600",
    fontSize: 14,
  },
  pillTextActive: {
    color: COLORS.primary,
  },

  // ── Save button
  saveBtn: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 50,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: COLORS.background,
    fontWeight: "bold",
    fontSize: 17,
    letterSpacing: 0.5,
  },
  footerNote: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
  },
});

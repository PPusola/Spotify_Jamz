import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Alert, SafeAreaView, Image,
  Modal, Pressable,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  updateProfile,
  subscribeToPrivateProfile,
  updatePrivateProfile,
} from "@services/userService";
import { uploadProfilePhoto, deleteProfilePhoto } from "@services/photoService";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { useTheme, useThemeControl } from "@hooks/useTheme";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

const MAX_PHOTOS = 5;

const EMOJI_OPTIONS = [
  "🎵","🎧","🎸","🎹","🎺","🎻","🥁","🎤",
  "🦁","🐯","🐻","🦊","🐺","🦋","🐙","🦄",
  "🔥","⚡","🌊","🌙","⭐","🌈","❄️","🎯",
  "👾","🤖","👽","💀","🧠","👁️","🫀","🎭",
];

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const COLORS = useTheme();
  const { theme, setTheme } = useThemeControl();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);

  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [selectedEmoji, setSelectedEmoji] = useState(profile?.emoji ?? "🎵");
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Private profile (photos + socials). Real-time so changes from another
  // device or the share-flow stay in sync.
  const [photos, setPhotos] = useState([]);
  const [instagram, setInstagram] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToPrivateProfile(user.uid, (priv) => {
      setPhotos(priv.photos ?? []);
      setInstagram(priv.instagram ?? "");
      setSnapchat(priv.snapchat ?? "");
    });
    return unsub;
  }, [user?.uid]);

  const handleAddPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limit reached", `You can upload at most ${MAX_PHOTOS} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const url = await uploadProfilePhoto(user.uid, result.assets[0].uri);
      const next = [...photos, url];
      await updatePrivateProfile(user.uid, { photos: next });
    } catch (e) {
      Alert.alert("Upload failed", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async (url) => {
    Alert.alert("Remove photo?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const next = photos.filter((u) => u !== url);
          try {
            await updatePrivateProfile(user.uid, { photos: next });
            deleteProfilePhoto(url);
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const handleSaveSocials = async () => {
    try {
      await updatePrivateProfile(user.uid, {
        instagram: instagram.trim().replace(/^@/, ""),
        snapchat: snapchat.trim().replace(/^@/, ""),
      });
      Alert.alert("Saved", "Your social handles were updated.");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleSave = async () => {
    if (!nickname.trim() || nickname.trim().length < 2) {
      Alert.alert("Invalid nickname", "Must be at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.uid, {
        nickname: nickname.trim(),
        emoji: selectedEmoji,
        isPublic,
      });
      setEditing(false);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Switch Account",
      "This will log you out of Spotify. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: logout },
      ]
    );
  };

  const handleOpenSettings = () => setSettingsOpen(true);

  const handleToggleVisibility = async (next) => {
    try {
      await updateProfile(user.uid, { isPublic: next });
      setIsPublic(next);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleToggleTheme = async (next) => {
    await setTheme(next);
  };

  const handleResetPassword = () => {
    Alert.alert(
      "Reset Spotify password?",
      "We sign you in with Spotify, so password changes happen on Spotify's website. Open it now?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open",
          onPress: () => Linking.openURL("https://www.spotify.com/account/password-reset/"),
        },
      ]
    );
  };

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editing ? "Edit Profile" : "Profile"}</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={handleOpenSettings}
            activeOpacity={0.8}
          >
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <LinearGradient
            colors={[COLORS.gradientStart + "30", COLORS.gradientEnd + "30"]}
            style={styles.avatarGlow}
          >
            <AvatarCircle name={profile.nickname} size={96} useGradient />
          </LinearGradient>
          <View style={styles.onlineDot} />

          {editing ? (
            <TextInput
              style={styles.nicknameInput}
              value={nickname}
              onChangeText={setNickname}
              maxLength={20}
              autoCapitalize="none"
              placeholderTextColor={COLORS.textMuted}
              textAlign="center"
            />
          ) : (
            <Text style={styles.nickname}>{profile.nickname}</Text>
          )}
          <Text style={styles.spotifyName}>🎵 {profile.spotifyDisplayName}</Text>

          {/* Edit · Stats action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, editing && styles.actionBtnActive]}
              onPress={() => setEditing(!editing)}
              activeOpacity={0.85}
            >
              <Text style={styles.actionIcon}>{editing ? "✕" : "✏️"}</Text>
              <Text style={[styles.actionLabel, editing && styles.actionLabelActive]}>
                {editing ? "Cancel" : "Edit Profile"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate("Stats")}
              activeOpacity={0.85}
            >
              <Text style={styles.actionIcon}>📊</Text>
              <Text style={styles.actionLabel}>Stats</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Emoji picker */}
        {editing && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CHOOSE YOUR EMOJI</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, selectedEmoji === emoji && styles.emojiOptionSelected]}
                  onPress={() => setSelectedEmoji(emoji)}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Visibility toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>
              {isPublic ? "🌐 Public profile" : "🔒 Private profile"}
            </Text>
            <Text style={styles.toggleSub}>
              {isPublic ? "Anyone can find and add you" : "Only room members can add you"}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={editing ? setIsPublic : undefined}
            disabled={!editing}
            trackColor={{ false: COLORS.surfaceHigh, true: COLORS.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Spotify stats */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionLabel}>SPOTIFY STATS</Text>
          {profile.followerCount > 0 && (
            <Text style={styles.statRow}>👥 {profile.followerCount} followers</Text>
          )}
          {profile.topArtists?.length > 0 && (
            <Text style={styles.statRow}>
              🎵 Top artists: {profile.topArtists.slice(0, 3).join(", ")}
            </Text>
          )}
          {profile.topGenres?.length > 0 && (
            <Text style={styles.statRow}>
              🎸 Top genres: {profile.topGenres.slice(0, 3).join(", ")}
            </Text>
          )}
          <Text style={styles.privateNote}>🔒 Only visible to you</Text>
        </View>

        {/* Save */}
        {editing && (
          <GradientButton
            onPress={handleSave}
            disabled={saving}
            loading={saving}
            label="Save Changes"
            style={styles.saveBtnWrap}
          />
        )}

        {/* ── Photos ───────────────────────────────────────────────── */}
        <View style={styles.privateSection}>
          <Text style={styles.sectionLabel}>YOUR PHOTOS</Text>
          <Text style={styles.privateHint}>
            Only shared with a match when you both tap "Share photos & socials".
          </Text>
          <View style={styles.photoGrid}>
            {photos.map((url) => (
              <TouchableOpacity
                key={url}
                style={styles.photoTile}
                onPress={() => setPreviewUrl(url)}
                onLongPress={() => handleRemovePhoto(url)}
                delayLongPress={350}
                activeOpacity={0.85}
              >
                <Image source={{ uri: url }} style={styles.photoImg} />
              </TouchableOpacity>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity
                style={[styles.photoTile, styles.addTile]}
                onPress={handleAddPhoto}
                disabled={uploading}
                activeOpacity={0.7}
              >
                {uploading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Text style={styles.addTileText}>＋</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.photoCount}>
            {photos.length}/{MAX_PHOTOS} · tap to enlarge · long-press to remove
          </Text>
        </View>

        {/* ── Social handles ───────────────────────────────────────── */}
        <View style={styles.privateSection}>
          <Text style={styles.sectionLabel}>SOCIALS (OPTIONAL)</Text>
          <Text style={styles.privateHint}>
            Shared only after a mutual "comfortable" reveal in a match.
          </Text>

          <View style={styles.socialRow}>
            <Text style={styles.socialIcon}>📸</Text>
            <TextInput
              style={styles.socialInput}
              placeholder="Instagram handle"
              placeholderTextColor={COLORS.textMuted}
              value={instagram}
              onChangeText={setInstagram}
              autoCapitalize="none"
              maxLength={30}
            />
          </View>

          <View style={styles.socialRow}>
            <Text style={styles.socialIcon}>👻</Text>
            <TextInput
              style={styles.socialInput}
              placeholder="Snapchat username"
              placeholderTextColor={COLORS.textMuted}
              value={snapchat}
              onChangeText={setSnapchat}
              autoCapitalize="none"
              maxLength={30}
            />
          </View>

          <TouchableOpacity
            style={styles.socialSaveBtn}
            onPress={handleSaveSocials}
            activeOpacity={0.85}
          >
            <Text style={styles.socialSaveText}>Save socials</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Settings sheet */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Settings</Text>

            {/* Public / Private */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>
                  {isPublic ? "🌐 Public profile" : "🔒 Private profile"}
                </Text>
                <Text style={styles.settingSub}>
                  {isPublic ? "Anyone can find and add you" : "Only room members can add you"}
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={handleToggleVisibility}
                trackColor={{ false: COLORS.surfaceHigh, true: COLORS.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Theme */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>
                  {theme === "dark" ? "🌙 Dark mode" : "☀️ Light mode"}
                </Text>
                <Text style={styles.settingSub}>
                  Switches the whole app instantly
                </Text>
              </View>
              <Switch
                value={theme === "dark"}
                onValueChange={(on) => handleToggleTheme(on ? "dark" : "light")}
                trackColor={{ false: COLORS.surfaceHigh, true: COLORS.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Reset password */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleResetPassword}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>🔑 Reset password</Text>
                <Text style={styles.settingSub}>Opens Spotify password reset</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>

            {/* Log out */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => { setSettingsOpen(false); handleLogout(); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: COLORS.error }]}>⇄ Log out</Text>
                <Text style={styles.settingSub}>Sign out of Spotify and TuneMatch</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setSettingsOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetCloseText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo preview overlay */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUrl(null)}>
          {previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewUrl(null)}
          >
            <Text style={styles.previewCloseText}>×</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  container: { padding: 22, paddingBottom: 48, alignItems: "center" },

  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
    marginTop: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: "bold", color: COLORS.textPrimary },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.surfaceAlt,
  },
  backBtnText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "bold" },
  editBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.surfaceAlt,
  },
  editBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "22" },
  editBtnText: { fontSize: 18 },

  avatarSection: { alignItems: "center", marginBottom: 28, position: "relative" },
  avatarGlow: {
    width: 116, height: 116, borderRadius: 58,
    justifyContent: "center", alignItems: "center",
    marginBottom: 16,
  },
  onlineDot: {
    position: "absolute", top: 8, right: "31%",
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.liveGreen,
    borderWidth: 2, borderColor: COLORS.background,
  },
  nickname: { fontSize: 24, fontWeight: "bold", color: COLORS.textPrimary, marginBottom: 4 },
  nicknameInput: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingVertical: 4,
    minWidth: 140,
    textAlign: "center",
    marginBottom: 4,
  },
  spotifyName: { fontSize: 13, color: COLORS.textSecondary },

  section: { width: "100%", marginBottom: 20 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 2,
    fontWeight: "700", marginBottom: 12,
  },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  emojiOption: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: "center", alignItems: "center",
  },
  emojiOptionSelected: {
    borderWidth: 2, borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "18",
  },
  emojiOptionText: { fontSize: 22 },

  toggleCard: {
    width: "100%",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 18, marginBottom: 16,
  },
  toggleInfo: { flex: 1, marginRight: 16 },
  toggleLabel: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "bold", marginBottom: 4 },
  toggleSub: { color: COLORS.textSecondary, fontSize: 13 },

  statsCard: {
    width: "100%",
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 18, marginBottom: 24,
  },
  statRow: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 6 },
  privateNote: { color: COLORS.textMuted, fontSize: 12, marginTop: 8, fontStyle: "italic" },

  saveBtnWrap: { width: "100%", marginBottom: 16 },

  privateSection: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  privateHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 17,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    width: 84, height: 84, borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
    overflow: "hidden",
    position: "relative",
  },
  photoImg: { width: "100%", height: "100%" },
  addTile: {
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderStyle: "dashed", borderColor: COLORS.primary,
  },
  addTileText: { color: COLORS.primary, fontSize: 30, fontWeight: "300" },
  photoCount: {
    color: COLORS.textMuted, fontSize: 11, marginTop: 10,
  },

  socialRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  socialIcon: { fontSize: 20, marginRight: 10 },
  socialInput: {
    flex: 1,
    color: COLORS.textPrimary,
    paddingVertical: 12,
    fontSize: 14,
  },
  socialSaveBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.primary + "22",
    borderRadius: 50,
    marginTop: 4,
  },
  socialSaveText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    width: "100%",
    paddingHorizontal: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    backgroundColor: COLORS.surface,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.surfaceAlt,
  },
  actionBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "18",
  },
  actionIcon: { fontSize: 14 },
  actionLabel: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700" },
  actionLabelActive: { color: COLORS.primary },

  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: COLORS.surfaceAlt,
  },
  settingsBtnText: { fontSize: 18 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10, paddingBottom: 28, paddingHorizontal: 20,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44, height: 4, borderRadius: 2,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: 14,
  },
  sheetTitle: {
    color: COLORS.textPrimary,
    fontSize: 18, fontWeight: "bold",
    marginBottom: 18,
  },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: COLORS.surfaceAlt,
  },
  settingTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "600" },
  settingSub:   { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  settingChevron: { color: COLORS.textMuted, fontSize: 24, fontWeight: "300" },
  sheetCloseBtn: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  sheetCloseText: { color: COLORS.background, fontWeight: "bold", fontSize: 15 },

  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "92%",
    height: "75%",
    borderRadius: 18,
  },
  previewClose: {
    position: "absolute", top: 48, right: 24,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  previewCloseText: { color: "#fff", fontSize: 26, lineHeight: 28 },
});

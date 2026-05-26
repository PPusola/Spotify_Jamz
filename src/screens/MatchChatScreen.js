import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Linking, Switch,
} from "react-native";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import {
  sendMatchMessage, subscribeToMatchChat,
  revealProfile, unrevealProfile, subscribeToMatchPfp,
  shareComfortableProfile, subscribeToSharedProfile,
  setMatchTyping, subscribeToMatchTyping,
  setMatchLastRead, subscribeToMatchLastRead,
  setMatchReaction,
} from "@services/matchService";
import { getPrivateProfile } from "@services/userService";
import { createRoom } from "@services/roomService";
import { useTheme } from "@hooks/useTheme";
import {
  TypingDots, DateSeparator, ReadReceipt, ReactionBadges, ReactionPicker,
  groupMessagesByDate,
} from "@components/ChatExtras";
import { sendPush } from "@services/pushService";

export default function MatchChatScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { matchId, otherNickname, otherEmoji, otherUid } = route.params;
  const { user, spotifyToken } = useAuth();
  const { profile } = useProfile();
  const [messages, setMessages] = useState([]);
  const [pfpShared, setPfpShared] = useState({});
  const [sharedProfiles, setSharedProfiles] = useState({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [jamming, setJamming] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [sharingComfort, setSharingComfort] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherLastRead, setOtherLastRead] = useState(0);
  const [pickerMsg, setPickerMsg] = useState(null);

  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  const displayName = profile?.nickname ?? user?.uid?.slice(0, 8) ?? "You";

  useEffect(() => {
    const unsubChat     = subscribeToMatchChat(matchId, setMessages);
    const unsubPfp      = subscribeToMatchPfp(matchId, setPfpShared);
    const unsubShared   = subscribeToSharedProfile(matchId, setSharedProfiles);
    const unsubTyping   = otherUid ? subscribeToMatchTyping(matchId, otherUid, setOtherTyping) : null;
    const unsubLastRead = otherUid ? subscribeToMatchLastRead(matchId, otherUid, setOtherLastRead) : null;
    if (user?.uid) setMatchLastRead(matchId, user.uid).catch(() => {});
    return () => {
      unsubChat(); unsubPfp(); unsubShared();
      if (unsubTyping) unsubTyping();
      if (unsubLastRead) unsubLastRead();
      if (user?.uid) setMatchTyping(matchId, user.uid, false).catch(() => {});
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [matchId, otherUid, user?.uid]);

  // Mark as read whenever a new message arrives while viewing
  useEffect(() => {
    if (!messages.length || !user?.uid) return;
    const last = messages[messages.length - 1];
    if (last.uid !== user.uid) {
      setMatchLastRead(matchId, user.uid).catch(() => {});
    }
  }, [messages.length, matchId, user?.uid]);

  // Auto-scroll to bottom on new message (inverted list → offset 0)
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollToOffset({ offset: 0, animated: true });
  }, [messages.length]);

  const handleChangeText = useCallback(
    (val) => {
      setText(val);
      const hasText = val.trim().length > 0;
      if (hasText && !isTypingRef.current) {
        isTypingRef.current = true;
        setMatchTyping(matchId, user.uid, true).catch(() => {});
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        isTypingRef.current = false;
        setMatchTyping(matchId, user.uid, false).catch(() => {});
      }, hasText ? 3000 : 0);
    },
    [matchId, user?.uid]
  );

  const handleReact = async (emoji) => {
    if (!pickerMsg) return;
    const target = pickerMsg;
    setPickerMsg(null);
    try {
      await setMatchReaction(matchId, target.id, user.uid, emoji);
    } catch {}
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("Mixtape", { matchId, otherNickname, otherUid })}
          style={styles.headerMixtapeBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.headerMixtapeIcon}>🎵</Text>
          <Text style={styles.headerMixtapeText}>YOUR MIXTAPE</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, matchId, otherNickname, otherUid]);

  // ── Pfp reveal state ──────────────────────────────────────────────────────
  const myAvatar    = pfpShared[user?.uid];
  const theirAvatar = otherUid ? pfpShared[otherUid] : null;
  const iRevealed   = !!myAvatar;
  const theyRevealed = !!theirAvatar;
  const bothRevealed = iRevealed && theyRevealed;

  const handleToggleReveal = async (next) => {
    if (revealing) return;
    setRevealing(true);
    try {
      if (next) {
        const avatarUrl = profile?.spotifyAvatar || "none";
        await revealProfile(matchId, user.uid, avatarUrl);
      } else {
        await unrevealProfile(matchId, user.uid);
      }
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not update profile share.");
    } finally {
      setRevealing(false);
    }
  };

  // ── Comfortable share (photos + socials) ──────────────────────────────────
  const myShared    = sharedProfiles[user?.uid];
  const theirShared = otherUid ? sharedProfiles[otherUid] : null;
  const iShared     = !!myShared;
  const theyShared  = !!theirShared;
  const bothShared  = iShared && theyShared;

  const handleComfortableShare = () => {
    if (sharingComfort || iShared) return;
    Alert.alert(
      "Share photos & socials?",
      `Your photos and social handles will become visible to ${otherNickname} once they also share theirs.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Share",
          onPress: async () => {
            setSharingComfort(true);
            try {
              const priv = await getPrivateProfile(user.uid);
              if (
                (!priv.photos || priv.photos.length === 0) &&
                !priv.instagram && !priv.snapchat
              ) {
                Alert.alert(
                  "Nothing to share",
                  "Add photos or a social handle in your profile first."
                );
                return;
              }
              await shareComfortableProfile(matchId, user.uid, priv);
            } catch (e) {
              Alert.alert("Error", e.message);
            } finally {
              setSharingComfort(false);
            }
          },
        },
      ]
    );
  };

  const openSocial = (kind, handle) => {
    const clean = String(handle).replace(/^@/, "");
    const url =
      kind === "instagram"
        ? `https://instagram.com/${clean}`
        : `https://snapchat.com/add/${clean}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Couldn't open link", url)
    );
  };

  // ── Messaging ─────────────────────────────────────────────────────────────
  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText("");
    if (typingTimer.current) clearTimeout(typingTimer.current);
    isTypingRef.current = false;
    setMatchTyping(matchId, user.uid, false).catch(() => {});
    setSending(true);
    try {
      await sendMatchMessage(matchId, user.uid, displayName, trimmed);
      if (otherUid) {
        sendPush({
          spotifyAccessToken: spotifyToken,
          recipientUid: otherUid,
          title: `${profile?.emoji ?? "🎵"} ${displayName}`,
          body: trimmed,
          data: {
            kind: "match_chat",
            matchId,
            otherUid: user.uid,
            otherNickname: displayName,
            otherEmoji: profile?.emoji ?? "🎵",
          },
        });
      }
    } finally {
      setSending(false);
    }
  };

  const handleJamTogether = async () => {
    if (jamming) return;
    setJamming(true);
    try {
      const code = await createRoom(user.uid, displayName);
      await sendMatchMessage(
        matchId, user.uid, displayName,
        `🎵 Started a Jam Sesh! Code: ${code}`,
        { type: "jam_invite", roomCode: code }
      );
      navigation.navigate("Room", { roomCode: code, isHost: true, displayName });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setJamming(false);
    }
  };

  // ── Feed assembly: date separators + typing row + messages ────────────────
  const feed = useMemo(() => {
    const grouped = groupMessagesByDate(messages);
    const reversed = [...grouped].reverse();
    if (otherTyping) reversed.unshift({ type: "typing", id: "__typing__" });
    return reversed;
  }, [messages, otherTyping]);

  const lastMyMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].uid === user?.uid) return messages[i].id;
    }
    return null;
  }, [messages, user?.uid]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderMessage = ({ item }) => {
    if (item.type === "date") return <DateSeparator label={item.label} />;
    if (item.type === "typing") {
      return (
        <View style={[styles.msgRow, styles.msgRowThem]}>
          <Text style={styles.msgAvatar}>{otherEmoji ?? "🎵"}</Text>
          <View style={[styles.bubble, styles.bubbleThem, { paddingVertical: 14 }]}>
            <TypingDots />
          </View>
        </View>
      );
    }

    const isMe = item.uid === user.uid;

    if (item.type === "jam_invite") {
      return (
        <View style={styles.jamInviteRow}>
          <TouchableOpacity
            style={styles.jamInviteCard}
            onPress={() => navigation.navigate("Room", { roomCode: item.roomCode, isHost: false, displayName })}
          >
            <Text style={styles.jamInviteEmoji}>🎵</Text>
            <Text style={styles.jamInviteTitle}>{item.displayName} started a Jam Sesh!</Text>
            <Text style={styles.jamInviteCode}>{item.roomCode}</Text>
            <Text style={styles.jamInviteJoin}>Tap to join</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const showRead = isMe && item.id === lastMyMsgId;
    const isRead = otherLastRead >= (item.sentAt ?? 0);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => setPickerMsg(item)}
        delayLongPress={250}
      >
        <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
          {!isMe && <Text style={styles.msgAvatar}>{otherEmoji ?? "🎵"}</Text>}
          <View style={isMe ? styles.bubbleColMe : styles.bubbleColThem}>
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && <Text style={styles.msgName}>{item.displayName}</Text>}
              <Text style={styles.msgText}>{item.text}</Text>
              <View style={styles.msgFooter}>
                <Text style={styles.msgTime}>{formatTime(item.sentAt)}</Text>
                {showRead && <ReadReceipt isRead={isRead} />}
              </View>
            </View>
            <ReactionBadges
              reactions={item.reactions}
              onPress={(emoji) => {
                const myCurrent = item.reactions?.[user.uid];
                setMatchReaction(matchId, item.id, user.uid, myCurrent === emoji ? null : emoji).catch(() => {});
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Profile reveal banner ─────────────────────────────────────────────────
  const renderRevealBanner = () => {
    const myUrl    = myAvatar    && myAvatar    !== "none" ? myAvatar    : null;
    const theirUrl = theirAvatar && theirAvatar !== "none" ? theirAvatar : null;

    const title = bothRevealed
      ? "Profiles revealed"
      : iRevealed
        ? "Photo shared"
        : "Profile anonymous";

    const sub = bothRevealed
      ? `You and ${otherNickname} can see each other's photo`
      : iRevealed
        ? `Waiting for ${otherNickname} to reveal too...`
        : "Toggle on to share your Spotify photo";

    return (
      <View>
        <View style={styles.revealToggleRow}>
          <Text style={styles.revealLock}>{iRevealed ? "🔓" : "🔒"}</Text>
          <View style={styles.revealTextWrap}>
            <Text style={styles.revealTitle}>{title}</Text>
            <Text style={styles.revealSub}>{sub}</Text>
          </View>
          {revealing
            ? <ActivityIndicator color={COLORS.primary} size="small" />
            : <Switch
                value={iRevealed}
                onValueChange={handleToggleReveal}
                trackColor={{ false: COLORS.surfaceAlt, true: COLORS.primary }}
                thumbColor="#fff"
              />
          }
        </View>

        {bothRevealed && (
          <View style={styles.revealAvatarsRow}>
            <AvatarBubble url={myUrl}    emoji={profile?.emoji} label="You" />
            <Text style={styles.revealHeart}>❤️</Text>
            <AvatarBubble url={theirUrl} emoji={otherEmoji}     label={otherNickname} />
          </View>
        )}
      </View>
    );
  };

  // ── Comfortable share banner (photos + socials) ───────────────────────────
  const renderComfortBanner = () => {
    if (bothShared) {
      return (
        <View style={styles.comfortPanel}>
          <Text style={styles.comfortHeader}>
            ✨ You both shared — here's {otherNickname}
          </Text>

          {theirShared.photos?.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoScroll}
              contentContainerStyle={{ gap: 8 }}
            >
              {theirShared.photos.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.comfortPhoto} />
              ))}
            </ScrollView>
          )}

          <View style={styles.socialButtonsRow}>
            {theirShared.instagram ? (
              <TouchableOpacity
                style={[styles.socialBtn, styles.igBtn]}
                onPress={() => openSocial("instagram", theirShared.instagram)}
                activeOpacity={0.85}
              >
                <Text style={styles.socialBtnText}>📸 @{theirShared.instagram.replace(/^@/, "")}</Text>
              </TouchableOpacity>
            ) : null}
            {theirShared.snapchat ? (
              <TouchableOpacity
                style={[styles.socialBtn, styles.snapBtn]}
                onPress={() => openSocial("snapchat", theirShared.snapchat)}
                activeOpacity={0.85}
              >
                <Text style={styles.socialBtnText}>👻 {theirShared.snapchat.replace(/^@/, "")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }

    if (iShared) {
      return (
        <View style={styles.comfortBanner}>
          <Text style={styles.comfortWait}>
            ✓ Shared with {otherNickname} — waiting for them to share back...
          </Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.comfortBanner}
        onPress={handleComfortableShare}
        disabled={sharingComfort}
        activeOpacity={0.85}
      >
        {sharingComfort ? (
          <ActivityIndicator color={COLORS.primary} size="small" />
        ) : (
          <>
            <Text style={styles.comfortIcon}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.comfortTitle}>Comfortable to share?</Text>
              <Text style={styles.comfortSub}>
                Tap to send your photos + socials — they only become visible
                once {otherNickname} shares back.
              </Text>
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Jam Together */}
      <TouchableOpacity style={styles.jamBanner} onPress={handleJamTogether} disabled={jamming} activeOpacity={0.85}>
        {jamming
          ? <ActivityIndicator color={COLORS.background} size="small" />
          : <><Text style={styles.jamBannerIcon}>🎵</Text><Text style={styles.jamBannerText}>Jam Together</Text></>
        }
      </TouchableOpacity>

      {/* Profile reveal */}
      {renderRevealBanner()}

      {/* Comfortable share — photos + socials */}
      {bothRevealed && renderComfortBanner()}

      <FlatList
        ref={listRef}
        data={feed}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.msgList}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={COLORS.textMuted}
          value={text}
          onChangeText={handleChangeText}
          onSubmitEditing={send}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>

      <ReactionPicker
        visible={!!pickerMsg}
        onSelect={handleReact}
        onClose={() => setPickerMsg(null)}
        currentReaction={pickerMsg?.reactions?.[user?.uid]}
      />
    </KeyboardAvoidingView>
  );
}

function AvatarBubble({ url, emoji, label }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <View style={styles.avatarWrap}>
      {url
        ? <Image source={{ uri: url }} style={styles.avatarImg} />
        : <View style={styles.avatarFallback}><Text style={{ fontSize: 28 }}>{emoji ?? "🎵"}</Text></View>
      }
      <Text style={styles.avatarLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function formatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  headerMixtapeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, marginRight: 12,
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1, borderColor: COLORS.primary + "55",
    borderRadius: 14,
  },
  headerMixtapeIcon: { fontSize: 12 },
  headerMixtapeText: { color: COLORS.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },

  jamBanner: { backgroundColor: COLORS.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 8 },
  jamBannerIcon: { fontSize: 18 },
  jamBannerText: { color: COLORS.background, fontWeight: "bold", fontSize: 15 },

  revealBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.surface, paddingVertical: 12, paddingHorizontal: 20,
    gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  revealToggleRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface,
    paddingVertical: 10, paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  revealTextWrap: { flex: 1 },
  revealAvatarsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.surface,
    paddingVertical: 12, paddingHorizontal: 20, gap: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  revealLock: { fontSize: 22 },
  revealTitle: { color: COLORS.textPrimary, fontWeight: "bold", fontSize: 13 },
  revealSub: { color: COLORS.textSecondary, fontSize: 11 },
  revealWait: { color: COLORS.textSecondary, fontSize: 13, fontStyle: "italic" },
  revealHeart: { fontSize: 24 },

  comfortBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  comfortIcon: { fontSize: 22 },
  comfortTitle: { color: COLORS.textPrimary, fontWeight: "bold", fontSize: 13 },
  comfortSub: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 15 },
  comfortWait: { color: COLORS.textSecondary, fontSize: 13, fontStyle: "italic", textAlign: "center", flex: 1 },

  comfortPanel: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  comfortHeader: {
    color: COLORS.textPrimary,
    fontWeight: "bold", fontSize: 13,
    marginBottom: 10,
  },
  photoScroll: { marginBottom: 12 },
  comfortPhoto: {
    width: 96, height: 96, borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
  },
  socialButtonsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  socialBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 50,
  },
  igBtn:   { backgroundColor: "#E1306C22", borderWidth: 1, borderColor: "#E1306C66" },
  snapBtn: { backgroundColor: "#FFFC0022", borderWidth: 1, borderColor: "#FFFC0066" },
  socialBtnText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },

  avatarWrap: { alignItems: "center", gap: 4 },
  avatarImg: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: COLORS.primary },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceAlt, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: COLORS.primary },
  avatarLabel: { color: COLORS.textMuted, fontSize: 11, maxWidth: 64 },

  msgList: { padding: 12, paddingBottom: 4 },
  msgRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end", gap: 8 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  msgAvatar: { fontSize: 24, marginBottom: 4 },
  bubbleColMe: { alignItems: "flex-end", maxWidth: "75%" },
  bubbleColThem: { alignItems: "flex-start", maxWidth: "75%" },
  bubble: { borderRadius: 18, padding: 12 },
  bubbleMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: COLORS.surface, borderBottomLeftRadius: 4 },
  msgName: { color: COLORS.textMuted, fontSize: 11, marginBottom: 4 },
  msgText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  msgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  msgTime: { color: COLORS.textMuted + "88", fontSize: 10 },

  jamInviteRow: { alignItems: "center", marginBottom: 12 },
  jamInviteCard: { backgroundColor: COLORS.surfaceAlt, borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1.5, borderColor: COLORS.primary, width: "80%" },
  jamInviteEmoji: { fontSize: 32, marginBottom: 8 },
  jamInviteTitle: { color: COLORS.textPrimary, fontWeight: "bold", fontSize: 14, textAlign: "center", marginBottom: 4 },
  jamInviteCode: { color: COLORS.primary, fontWeight: "bold", fontSize: 22, letterSpacing: 6, marginBottom: 4 },
  jamInviteJoin: { color: COLORS.textSecondary, fontSize: 12 },

  inputRow: { flexDirection: "row", padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: COLORS.surface, backgroundColor: COLORS.background },
  input: { flex: 1, backgroundColor: COLORS.surface, color: COLORS.textPrimary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 18, justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: COLORS.surfaceAlt },
  sendBtnText: { color: COLORS.background, fontWeight: "bold", fontSize: 14 },
});

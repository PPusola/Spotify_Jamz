import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import {
  subscribeToDMMessages, sendDM, markDMRead, getOrCreateDM,
  setDMTyping, subscribeToDMTyping,
  setDMLastRead, subscribeToDMLastRead,
  setDMReaction,
} from "@services/dmService";
import { sendPush } from "@services/pushService";
import { blockUser, reportUser, REPORT_REASONS } from "@services/blockService";
import { getProfile } from "@services/userService";
import { effectivePhotoUrl } from "@utils/photoVisibility";
import { useTheme } from "@hooks/useTheme";
import {
  TypingDots, DateSeparator, ReadReceipt, ReactionBadges, ReactionPicker,
  groupMessagesByDate,
} from "@components/ChatExtras";

export default function DMChatScreen({ route, navigation }) {
  const COLORS = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { otherUid, otherNickname, otherEmoji } = route.params;
  const { user, spotifyToken } = useAuth();
  const { profile } = useProfile();

  // Resolve the other user's live profile so a deleted account shows up as
  // "Deleted account" instead of the cached nickname from navigation params.
  const [other, setOther] = useState({
    nickname: otherNickname,
    emoji: otherEmoji,
    photoUrl: null,
    deleted: false,
  });

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    getProfile(otherUid)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setOther({ nickname: "Deleted account", emoji: "👻", photoUrl: null, deleted: true });
        } else {
          setOther({
            nickname: p.nickname ?? otherNickname,
            emoji: p.emoji ?? otherEmoji,
            photoUrl: effectivePhotoUrl(p, "chat"),
            deleted: false,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [otherUid]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dmId, setDmId] = useState(route.params.dmId ?? null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherLastRead, setOtherLastRead] = useState(0);
  const [pickerMsg, setPickerMsg] = useState(null);

  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  const myNickname = profile?.nickname ?? user?.uid?.slice(0, 8) ?? "Me";
  const myEmoji = profile?.emoji ?? "🎵";

  const confirmBlock = () => {
    if (!otherUid) return;
    Alert.alert(
      `Block ${otherNickname || "this user"}?`,
      "They won't be able to message you and you won't see them in matches or discover.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(user.uid, otherUid, otherNickname);
              navigation.goBack();
            } catch (e) {
              Alert.alert("Couldn't block", e?.message || "Unknown error");
            }
          },
        },
      ]
    );
  };

  const submitReport = async (reason) => {
    try {
      await reportUser({
        reporterUid: user.uid,
        reportedUid: otherUid,
        reason,
        context: `dm:${dmId}`,
      });
      Alert.alert(
        "Report submitted",
        "Thanks — we'll review this. Block them too if they're bothering you."
      );
    } catch (e) {
      Alert.alert("Couldn't report", e?.message || "Unknown error");
    }
  };

  const handleMoreMenu = useCallback(() => {
    Alert.alert(otherNickname || "Options", undefined, [
      { text: "🚫 Block user", style: "destructive", onPress: confirmBlock },
      {
        text: "🚩 Report user",
        onPress: () => {
          const buttons = REPORT_REASONS.map((reason) => ({
            text: reason,
            onPress: () => submitReport(reason),
          }));
          buttons.push({ text: "Cancel", style: "cancel" });
          Alert.alert("Report user", "Pick a reason:", buttons);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [otherNickname, otherUid, user?.uid, dmId]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          {other.photoUrl
            ? <Image source={{ uri: other.photoUrl }} style={styles.headerAvatarImg} />
            : <Text style={styles.headerAvatarEmoji}>{other.emoji || "🎵"}</Text>}
          <Text style={styles.headerTitleText} numberOfLines={1}>{other.nickname || "Chat"}</Text>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleMoreMenu}
          style={{ paddingHorizontal: 14, paddingVertical: 6, marginRight: 4 }}
          activeOpacity={0.7}
          accessibilityLabel="More options"
        >
          <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: "700" }}>⋮</Text>
        </TouchableOpacity>
      ),
    });
  }, [other.nickname, other.emoji, other.photoUrl, handleMoreMenu, COLORS.textPrimary, styles]);

  // Ensure DM exists and subscribe to messages, typing, and read receipts
  useEffect(() => {
    if (!user?.uid) return;
    const subs = [];

    const init = async () => {
      let id = dmId;
      if (!id) {
        id = await getOrCreateDM(user.uid, otherUid);
        setDmId(id);
      }
      await markDMRead(id, user.uid);
      await setDMLastRead(id, user.uid);
      subs.push(subscribeToDMMessages(id, setMessages));
      subs.push(subscribeToDMTyping(id, otherUid, setOtherTyping));
      subs.push(subscribeToDMLastRead(id, otherUid, setOtherLastRead));
    };

    init();
    return () => {
      subs.forEach((u) => u && u());
      // Best-effort: clear typing flag when leaving
      if (dmId) setDMTyping(dmId, user.uid, false).catch(() => {});
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [user?.uid]);

  // Mark as read whenever a new message arrives while we're viewing
  useEffect(() => {
    if (!dmId || !messages.length) return;
    const last = messages[messages.length - 1];
    if (last.uid !== user.uid) {
      setDMLastRead(dmId, user.uid).catch(() => {});
    }
  }, [messages.length, dmId, user?.uid]);

  // Auto-scroll to bottom when a new message arrives (inverted list → offset 0)
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollToOffset({ offset: 0, animated: true });
  }, [messages.length]);

  // Debounced typing flag — true while typing, auto-clears 3s after last keystroke
  const handleChangeText = useCallback(
    (val) => {
      setText(val);
      if (!dmId) return;
      const hasText = val.trim().length > 0;

      if (hasText && !isTypingRef.current) {
        isTypingRef.current = true;
        setDMTyping(dmId, user.uid, true).catch(() => {});
      }

      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        isTypingRef.current = false;
        setDMTyping(dmId, user.uid, false).catch(() => {});
      }, hasText ? 3000 : 0);
    },
    [dmId, user?.uid]
  );

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !dmId) return;
    setText("");
    if (typingTimer.current) clearTimeout(typingTimer.current);
    isTypingRef.current = false;
    setDMTyping(dmId, user.uid, false).catch(() => {});
    setSending(true);
    try {
      await sendDM(dmId, user.uid, myNickname, myEmoji, otherUid, other.nickname, other.emoji, trimmed);
      sendPush({
        spotifyAccessToken: spotifyToken,
        recipientUid: otherUid,
        title: `${myEmoji} ${myNickname}`,
        body: trimmed,
        data: {
          kind: "dm",
          dmId,
          otherUid: user.uid,
          otherNickname: myNickname,
          otherEmoji: myEmoji,
        },
      });
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (emoji) => {
    if (!pickerMsg || !dmId) return;
    const target = pickerMsg;
    setPickerMsg(null);
    try {
      await setDMReaction(dmId, target.id, user.uid, emoji);
    } catch (e) {
      console.warn("[reaction] setDMReaction failed:", e?.message, e);
      Alert.alert(
        "Couldn't react",
        `${e?.message || "Unknown error"}\n\nIf this says PERMISSION_DENIED, deploy the new firebase rules: \`firebase deploy --only database\``
      );
    }
  };

  // Build the inverted feed: messages + date separators + (optional) typing row
  const feed = useMemo(() => {
    const grouped = groupMessagesByDate(messages);
    const reversed = [...grouped].reverse();
    if (otherTyping) {
      reversed.unshift({ type: "typing", id: "__typing__" });
    }
    return reversed;
  }, [messages, otherTyping]);

  // Identify the most recent message sent by me — only that one gets a read receipt
  const lastMyMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].uid === user?.uid) return messages[i].id;
    }
    return null;
  }, [messages, user?.uid]);

  const renderItem = ({ item }) => {
    if (item.type === "date") return <DateSeparator label={item.label} />;
    if (item.type === "typing") {
      return (
        <View style={[styles.msgRow, styles.msgRowThem]}>
          <DMAvatar photoUrl={other.photoUrl} emoji={other.emoji} styles={styles} />
          <View style={[styles.bubble, styles.bubbleThem, styles.typingBubble]}>
            <TypingDots />
          </View>
        </View>
      );
    }

    const isMe = item.uid === user.uid;
    const showRead = isMe && item.id === lastMyMsgId;
    const isRead = otherLastRead >= (item.sentAt ?? 0);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => setPickerMsg(item)}
        delayLongPress={250}
      >
        <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
          {!isMe && <DMAvatar photoUrl={other.photoUrl} emoji={other.emoji} styles={styles} />}
          <View style={isMe ? styles.bubbleColMe : styles.bubbleColThem}>
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={styles.msgText}>{item.text}</Text>
              <View style={styles.msgFooter}>
                <Text style={styles.msgTime}>{formatTime(item.sentAt)}</Text>
                {showRead && <ReadReceipt isRead={isRead} />}
              </View>
            </View>
            <ReactionBadges
              reactions={item.reactions}
              onPress={(emoji) => {
                // Tap your own emoji to remove; tap a different one to switch
                const myCurrent = item.reactions?.[user.uid];
                setDMReaction(dmId, item.id, user.uid, myCurrent === emoji ? null : emoji).catch((e) => {
                  console.warn("[reaction badge] setDMReaction failed:", e?.message, e);
                });
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={feed}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${other.nickname}...`}
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
          {sending
            ? <ActivityIndicator color={COLORS.background} size="small" />
            : <Text style={styles.sendBtnText}>↑</Text>
          }
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

function DMAvatar({ photoUrl, emoji, styles }) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={styles.avatarImg} />;
  }
  return (
    <View style={styles.avatarCircle}>
      <Text style={styles.avatarEmoji}>{emoji ?? "🎵"}</Text>
    </View>
  );
}

function formatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: "row", marginBottom: 12, alignItems: "flex-end", gap: 8 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceAlt, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  avatarImg: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceAlt, marginBottom: 2 },
  avatarEmoji: { fontSize: 16 },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 220 },
  headerAvatarImg: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.surfaceAlt },
  headerAvatarEmoji: { fontSize: 20 },
  headerTitleText: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "bold", flexShrink: 1 },
  bubbleColMe: { alignItems: "flex-end", maxWidth: "75%" },
  bubbleColThem: { alignItems: "flex-start", maxWidth: "75%" },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: COLORS.surface, borderBottomLeftRadius: 4 },
  typingBubble: { paddingVertical: 14, paddingHorizontal: 16 },
  msgText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  msgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  msgTime: { color: COLORS.textMuted + "99", fontSize: 10 },
  inputRow: {
    flexDirection: "row", padding: 12, gap: 10,
    borderTopWidth: 1, borderTopColor: COLORS.surface,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1, backgroundColor: COLORS.surface, color: COLORS.textPrimary,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: COLORS.surfaceAlt },
  sendBtnText: { color: COLORS.background, fontWeight: "bold", fontSize: 20 },
});

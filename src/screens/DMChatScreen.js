import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import { subscribeToDMMessages, sendDM, markDMRead, getOrCreateDM } from "@services/dmService";
import { useTheme } from "@hooks/useTheme";

export default function DMChatScreen({ route, navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { otherUid, otherNickname, otherEmoji } = route.params;
  const { user } = useAuth();
  const { profile } = useProfile();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dmId, setDmId] = useState(route.params.dmId ?? null);

  const myNickname = profile?.nickname ?? user?.uid?.slice(0, 8) ?? "Me";
  const myEmoji = profile?.emoji ?? "🎵";

  useEffect(() => {
    navigation.setOptions({ title: `${otherEmoji ?? "🎵"} ${otherNickname}` });
  }, [otherNickname, otherEmoji]);

  // Ensure DM exists and subscribe
  useEffect(() => {
    if (!user?.uid) return;
    let unsub;

    const init = async () => {
      let id = dmId;
      if (!id) {
        id = await getOrCreateDM(user.uid, otherUid);
        setDmId(id);
      }
      await markDMRead(id, user.uid);
      unsub = subscribeToDMMessages(id, setMessages);
    };

    init();
    return () => { if (unsub) unsub(); };
  }, [user?.uid]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !dmId) return;
    setText("");
    setSending(true);
    try {
      await sendDM(dmId, user.uid, myNickname, myEmoji, otherUid, otherNickname, otherEmoji, trimmed);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.uid === user.uid;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe && (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>{otherEmoji ?? "🎵"}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={styles.msgText}>{item.text}</Text>
          <Text style={styles.msgTime}>{formatTime(item.sentAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${otherNickname}...`}
          placeholderTextColor={COLORS.textMuted}
          value={text}
          onChangeText={setText}
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
    </KeyboardAvoidingView>
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
  avatarEmoji: { fontSize: 16 },
  bubble: { maxWidth: "75%", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: COLORS.surface, borderBottomLeftRadius: 4 },
  msgText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  msgTime: { color: COLORS.textMuted + "99", fontSize: 10, marginTop: 4, textAlign: "right" },
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

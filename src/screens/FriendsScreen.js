import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@hooks/useAuth";
import { useProfile } from "@hooks/useProfile";
import {
  sendFriendRequest, cancelFriendRequest, acceptFriendRequest,
  declineFriendRequest, removeFriend, getFriends,
  subscribeToPendingRequests, checkRelationship,
} from "@services/friendRequestService";
import { getOrCreateDM } from "@services/dmService";
import { useTheme } from "@hooks/useTheme";
import AvatarCircle from "@components/AvatarCircle";
import GradientButton from "@components/GradientButton";

const TABS = ["Find", "Requests", "Friends"];

export default function FriendsScreen({ navigation }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [activeTab, setActiveTab] = useState("Find");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [relationMap, setRelationMap] = useState({});
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToPendingRequests(user.uid, setPendingRequests);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (activeTab === "Friends") loadFriends();
  }, [activeTab]);

  const loadFriends = async () => {
    setLoading(true);
    const list = await getFriends(user.uid);
    setFriends(list);
    setLoading(false);
  };

  const handleSearch = async () => {
    const clean = searchQuery.replace("@", "").trim().toLowerCase();
    if (!clean) return;
    setLoading(true);
    try {
      const { get, ref } = await import("firebase/database");
      const { db } = await import("@services/firebase");
      const snap = await get(ref(db, "users"));
      if (!snap.exists()) { setSearchResults([]); return; }
      const results = Object.entries(snap.val())
        .filter(([uid, u]) => uid !== user.uid && u.nickname?.toLowerCase().includes(clean))
        .map(([uid, u]) => ({ uid, ...u }));
      setSearchResults(results);

      const rels = {};
      await Promise.all(results.map(async (u) => {
        rels[u.uid] = await checkRelationship(user.uid, u.uid);
      }));
      setRelationMap(rels);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (target) => {
    setActing(target.uid);
    try {
      await sendFriendRequest(user.uid, profile, target.uid);
      setRelationMap(r => ({ ...r, [target.uid]: "pending_sent" }));
    } catch { Alert.alert("Error", "Could not send request."); }
    finally { setActing(null); }
  };

  const handleCancelRequest = async (target) => {
    setActing(target.uid);
    try {
      await cancelFriendRequest(user.uid, target.uid);
      setRelationMap(r => ({ ...r, [target.uid]: "none" }));
    } catch { Alert.alert("Error", "Could not cancel."); }
    finally { setActing(null); }
  };

  const handleAccept = async (req) => {
    setActing(req.fromUid);
    try {
      await acceptFriendRequest(user.uid, profile, req.fromUid);
    } catch { Alert.alert("Error", "Could not accept."); }
    finally { setActing(null); }
  };

  const handleDecline = async (req) => {
    setActing(req.fromUid);
    try {
      await declineFriendRequest(user.uid, req.fromUid);
    } catch { Alert.alert("Error", "Could not decline."); }
    finally { setActing(null); }
  };

  const handleRemoveFriend = (friendUid) => {
    Alert.alert("Remove Friend", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await removeFriend(user.uid, friendUid);
          setFriends(f => f.filter(x => x.uid !== friendUid));
        },
      },
    ]);
  };

  const handleMessage = async (friend) => {
    const dmId = await getOrCreateDM(user.uid, friend.uid);
    navigation.navigate("DMChat", {
      dmId,
      otherUid: friend.uid,
      otherNickname: friend.nickname,
      otherEmoji: friend.emoji,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.topBar}>
          <Text style={styles.headerTitle}>Friends</Text>
          <TouchableOpacity
            style={styles.messagesBtn}
            onPress={() => navigation.navigate("DMList")}
            activeOpacity={0.8}
          >
            <Text style={styles.messagesBtnText}>💬 Messages</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
            >
              {activeTab === t ? (
                <LinearGradient
                  colors={[COLORS.gradientStart + "44", COLORS.gradientEnd + "44"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.tabActiveBg}
                >
                  <Text style={[styles.tabText, styles.tabTextActive]}>
                    {t}{t === "Requests" && pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
                  </Text>
                </LinearGradient>
              ) : (
                <Text style={styles.tabText}>
                  {t}{t === "Requests" && pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* FIND */}
          {activeTab === "Find" && (
            <View style={styles.section}>
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrap}>
                  <Text style={styles.searchInputIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by nickname..."
                    placeholderTextColor={COLORS.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                  />
                </View>
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.85}>
                  <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.searchBtnGradient}
                  >
                    <Text style={styles.searchBtnText}>Go</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}

              {!loading && searchResults.map(u => {
                const rel = relationMap[u.uid] ?? "none";
                const isActing = acting === u.uid;
                return (
                  <View key={u.uid} style={styles.userRow}>
                    <AvatarCircle name={u.nickname} size={44} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userNickname}>{u.nickname}</Text>
                    </View>
                    {isActing
                      ? <ActivityIndicator color={COLORS.primary} size="small" />
                      : rel === "friends"
                        ? <Text style={styles.tagFriends}>Friends ✓</Text>
                        : rel === "pending_sent"
                          ? <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelRequest(u)}>
                              <Text style={styles.cancelBtnText}>Requested</Text>
                            </TouchableOpacity>
                          : rel === "pending_received"
                            ? <Text style={styles.tagPending}>Wants to add you</Text>
                            : <GradientButton
                                onPress={() => handleSendRequest(u)}
                                label="Add"
                                gradientStyle={styles.addGradient}
                                labelStyle={styles.addLabel}
                              />
                    }
                  </View>
                );
              })}

              {!loading && searchResults.length === 0 && searchQuery.length > 0 && (
                <Text style={styles.emptyText}>No users found.</Text>
              )}
            </View>
          )}

          {/* REQUESTS */}
          {activeTab === "Requests" && (
            <View style={styles.section}>
              {pendingRequests.length === 0
                ? <Text style={styles.emptyText}>No pending friend requests.</Text>
                : pendingRequests.map(req => (
                    <View key={req.fromUid} style={styles.userRow}>
                      <AvatarCircle name={req.nickname} size={44} />
                      <View style={styles.userInfo}>
                        <Text style={styles.userNickname}>{req.nickname}</Text>
                        <Text style={styles.userSub}>Wants to be your friend</Text>
                      </View>
                      {acting === req.fromUid
                        ? <ActivityIndicator color={COLORS.primary} size="small" />
                        : <View style={styles.requestBtns}>
                            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(req)}>
                              <Text style={styles.acceptBtnText}>✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(req)}>
                              <Text style={styles.declineBtnText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                      }
                    </View>
                  ))
              }
            </View>
          )}

          {/* FRIENDS */}
          {activeTab === "Friends" && (
            <View style={styles.section}>
              {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}
              {!loading && friends.length === 0 && (
                <Text style={styles.emptyText}>No friends yet — find people in the Find tab.</Text>
              )}
              {!loading && friends.map(f => (
                <View key={f.uid} style={styles.userRow}>
                  <AvatarCircle name={f.nickname} size={44} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userNickname}>{f.nickname}</Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleMessage(f)}>
                    <Text style={styles.iconBtnText}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, styles.removeBtn]} onPress={() => handleRemoveFriend(f.uid)}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20 },

  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 20, marginTop: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: COLORS.textPrimary },
  messagesBtn: {
    backgroundColor: COLORS.surface, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  messagesBtnText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },

  tabRow: {
    flexDirection: "row", backgroundColor: COLORS.surface,
    borderRadius: 16, padding: 4, marginBottom: 20, gap: 4,
  },
  tab: { flex: 1, borderRadius: 12, overflow: "hidden" },
  tabActive: {},
  tabActiveBg: { paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center", paddingVertical: 10 },
  tabTextActive: { color: COLORS.textPrimary, fontWeight: "bold" },

  scroll: { paddingBottom: 40 },
  section: { gap: 10 },

  searchRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  searchInputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 14,
    paddingHorizontal: 14, gap: 8,
  },
  searchInputIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: COLORS.textPrimary, paddingVertical: 13, fontSize: 14 },
  searchBtn: { borderRadius: 14, overflow: "hidden" },
  searchBtnGradient: { paddingHorizontal: 18, paddingVertical: 13, alignItems: "center" },
  searchBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  userRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 14, gap: 12,
  },
  userInfo: { flex: 1 },
  userNickname: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "bold" },
  userSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  addGradient: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 50 },
  addLabel: { fontSize: 13, fontWeight: "bold" },
  cancelBtn: {
    backgroundColor: COLORS.surfaceHigh, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: "bold", fontSize: 13 },
  tagFriends: { color: COLORS.liveGreen, fontWeight: "bold", fontSize: 12 },
  tagPending: { color: COLORS.textMuted, fontSize: 12, fontStyle: "italic" },

  requestBtns: { flexDirection: "row", gap: 8 },
  acceptBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.liveGreen + "22",
    borderWidth: 1.5, borderColor: COLORS.liveGreen,
    justifyContent: "center", alignItems: "center",
  },
  acceptBtnText: { color: COLORS.liveGreen, fontWeight: "bold", fontSize: 16 },
  declineBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center", alignItems: "center",
  },
  declineBtnText: { color: COLORS.textSecondary, fontWeight: "bold", fontSize: 16 },

  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnText: { fontSize: 16 },
  removeBtn: {},
  removeBtnText: { color: COLORS.error, fontWeight: "bold", fontSize: 14 },

  emptyText: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 32, fontStyle: "italic" },
});

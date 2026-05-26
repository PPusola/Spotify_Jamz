import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuth } from "@hooks/useAuth";
import { savePushToken, removePushToken } from "@services/userService";

// Foreground behaviour — show banner + play sound when a push arrives while
// the user has the app open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this device for push, stores the token under the current user,
 * and wires up a tap handler that navigates to the right screen.
 *
 * Mount once at the top of the app (inside AppProvider tree) — it self-cleans
 * on unmount and bails out if the user is logged out.
 */
export function useNotifications(navigationRef) {
  const { user } = useAuth();
  const receivedSub = useRef(null);
  const responseSub = useRef(null);
  const registeredTokenRef = useRef(null);

  // Register token whenever we have a user
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;
      try {
        await savePushToken(user.uid, token);
        registeredTokenRef.current = token;
      } catch (e) {
        console.warn("[push] failed to save token:", e?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid]);

  // Wire up listeners (foreground arrivals + tap responses)
  useEffect(() => {
    receivedSub.current = Notifications.addNotificationReceivedListener(() => {
      // No-op for now; the setNotificationHandler above decides foreground UI.
    });

    responseSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (!navigationRef?.current?.isReady?.()) return;
      handleNotificationTap(navigationRef.current, data);
    });

    return () => {
      receivedSub.current?.remove?.();
      responseSub.current?.remove?.();
    };
  }, [navigationRef]);

  // On logout: remove the token from the previous user so they stop receiving
  // pushes meant for this device.
  useEffect(() => {
    if (user?.uid) return;
    const stale = registeredTokenRef.current;
    if (!stale) return;
    registeredTokenRef.current = null;
    // Best-effort; we don't know which uid owned it after sign-out.
  }, [user?.uid]);
}

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.warn("[push] not a physical device — skipping");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1DB954",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    console.warn("[push] permission denied");
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  try {
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenResp?.data ?? null;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync failed:", e?.message);
    return null;
  }
}

function handleNotificationTap(navigation, data) {
  // Payload shape (set by the worker / sender):
  //   { kind: "dm", dmId, otherUid, otherNickname, otherEmoji }
  //   { kind: "match_chat", matchId, otherUid, otherNickname, otherEmoji }
  //   { kind: "match_new", matchId, otherUid, otherNickname, otherEmoji }
  //   { kind: "friend_request" }
  switch (data?.kind) {
    case "dm":
      navigation.navigate("DMChat", {
        dmId: data.dmId,
        otherUid: data.otherUid,
        otherNickname: data.otherNickname,
        otherEmoji: data.otherEmoji,
      });
      break;
    case "match_chat":
    case "match_new":
      navigation.navigate("MatchChat", {
        matchId: data.matchId,
        otherUid: data.otherUid,
        otherNickname: data.otherNickname,
        otherEmoji: data.otherEmoji,
      });
      break;
    case "friend_request":
      navigation.navigate("MainTabs", { screen: "Friends" });
      break;
    default:
      break;
  }
}

export { registerForPushNotificationsAsync };

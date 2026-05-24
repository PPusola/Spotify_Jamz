import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@hooks/useAuth";
import { useTheme } from "@hooks/useTheme";
import { profileExists } from "@services/userService";
import { getMe, getTopArtists, getTopGenres, getTopTracks } from "@services/spotify";

import LoginScreen from "@screens/LoginScreen";
import ProfileSetupScreen from "@screens/ProfileSetupScreen";
import HomeScreen from "@screens/HomeScreen";
import RoomScreen from "@screens/RoomScreen";
import SearchScreen from "@screens/SearchScreen";
import ProfileScreen from "@screens/ProfileScreen";
import StatsScreen from "@screens/StatsScreen";
import FriendsScreen from "@screens/FriendsScreen";
import DiscoverScreen from "@screens/DiscoverScreen";
import MatchesScreen from "@screens/MatchesScreen";
import MatchChatScreen from "@screens/MatchChatScreen";
import MixtapeScreen from "@screens/MixtapeScreen";
import DMListScreen from "@screens/DMListScreen";
import DMChatScreen from "@screens/DMChatScreen";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home: { active: "🎵", inactive: "🎵" },
  Discover: { active: "🔥", inactive: "🔥" },
  Matches: { active: "💜", inactive: "💜" },
  Friends: { active: "👥", inactive: "👥" },
  Profile: { active: "👤", inactive: "👤" },
};

function TabIcon({ name, focused }) {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Text style={[styles.tabIconEmoji, { opacity: focused ? 1 : 0.45 }]}>
        {TAB_ICONS[name]?.active ?? "●"}
      </Text>
    </View>
  );
}

function MainTabs() {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const tabBarStyle = useMemo(
    () => [
      styles.tabBar,
      {
        height: 64 + insets.bottom,
        paddingBottom: 10 + insets.bottom,
      },
    ],
    [styles.tabBar, insets.bottom]
  );
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        headerStyle: { backgroundColor: COLORS.surface, shadowColor: "transparent", elevation: 0, borderBottomWidth: 0 },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: "bold", fontSize: 17 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: "Discover" }} />
      <Tab.Screen name="Matches" component={MatchesScreen} options={{ title: "Matches" }} />
      <Tab.Screen name="Friends" component={FriendsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

const Loader = () => {
  const COLORS = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <View style={styles.loader}>
      <Text style={styles.loaderLogo}>🎵</Text>
      <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 16 }} />
    </View>
  );
};

export default function AppNavigator() {
  const COLORS = useTheme();
  const stackOptions = useMemo(() => ({
    headerStyle: { backgroundColor: COLORS.surface, shadowColor: "transparent", elevation: 0, borderBottomWidth: 0 },
    headerTintColor: COLORS.textPrimary,
    headerTitleStyle: { fontWeight: "bold", fontSize: 17 },
    cardStyle: { backgroundColor: COLORS.background },
  }), [COLORS]);
  const { user, spotifyToken, loading } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [spotifyProfileData, setSpotifyProfileData] = useState(null);

  useEffect(() => {
    if (!spotifyToken || !user?.uid) return;

    const bailout = setTimeout(() => {
      console.warn("Profile check bailout — forcing profileReady");
      setCheckingProfile(false);
      setProfileReady(true);
    }, 10000);

    const check = async () => {
      setCheckingProfile(true);
      try {
        const exists = await profileExists(user.uid);
        setHasProfile(exists);

        if (!exists) {
          const [me, topArtists, topGenres, topTracks] = await Promise.all([
            getMe(spotifyToken),
            getTopArtists(spotifyToken),
            getTopGenres(spotifyToken),
            getTopTracks(spotifyToken).catch(() => []),
          ]);
          setSpotifyProfileData({ me, topArtists, topGenres, topTracks });
        }
      } catch (e) {
        console.warn("Profile check error:", e.message);
      } finally {
        clearTimeout(bailout);
        setCheckingProfile(false);
        setProfileReady(true);
      }
    };

    check();
  }, [spotifyToken, user?.uid]);

  if (loading || checkingProfile || (spotifyToken && !profileReady)) {
    return <Loader />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={stackOptions}>
        {!spotifyToken ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : !hasProfile ? (
          <Stack.Screen
            name="ProfileSetup"
            component={ProfileSetupScreen}
            options={{ headerShown: false }}
            initialParams={{
              spotifyProfile: spotifyProfileData?.me,
              topArtists: spotifyProfileData?.topArtists,
              topGenres: spotifyProfileData?.topGenres,
              topTracks: spotifyProfileData?.topTracks,
              onProfileCreated: () => setHasProfile(true),
            }}
          />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Room" component={RoomScreen} options={{ title: "Jam Session" }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: "Pick a Song" }} />
            <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="MatchChat"
              component={MatchChatScreen}
              options={({ route }) => ({
                title: `${route.params?.otherEmoji ?? "🎵"} ${route.params?.otherNickname ?? "Match"}`,
              })}
            />
            <Stack.Screen name="Mixtape" component={MixtapeScreen} options={{ title: "Your Mixtape" }} />
            <Stack.Screen name="DMList" component={DMListScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="DMChat"
              component={DMChatScreen}
              options={({ route }) => ({
                title: `${route.params?.otherEmoji ?? "🎵"} ${route.params?.otherNickname ?? "Chat"}`,
              })}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.surfaceAlt,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 10,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  tabIconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  tabIconWrapActive: {
    backgroundColor: COLORS.primary + "22",
  },
  tabIconEmoji: {
    fontSize: 18,
  },
  loader: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderLogo: {
    fontSize: 56,
  },
});

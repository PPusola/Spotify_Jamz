import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "@navigation/AppNavigator";
import { AuthProvider } from "@hooks/useAuth";
import { RoomProvider } from "@hooks/useRoomContext";
import { ThemeProvider, useThemeControl } from "@hooks/useTheme";

function ThemedStatusBar() {
  const { theme } = useThemeControl();
  return <StatusBar style={theme === "light" ? "dark" : "light"} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <RoomProvider>
            <ThemedStatusBar />
            <AppNavigator />
          </RoomProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

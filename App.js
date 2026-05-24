import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "@navigation/AppNavigator";
import { AuthProvider } from "@hooks/useAuth";
import { RoomProvider } from "@hooks/useRoomContext";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RoomProvider>
          <StatusBar style="light" />
          <AppNavigator />
        </RoomProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

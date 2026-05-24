import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyTheme, COLORS, DARK_COLORS, LIGHT_COLORS } from "@constants";

const THEME_KEY = "@tunematch_theme";

const ThemeContext = createContext({
  theme: "dark",
  colors: COLORS,
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      const next = stored === "light" ? "light" : "dark";
      applyTheme(next);
      setThemeState(next);
    });
  }, []);

  const setTheme = useCallback(async (next) => {
    applyTheme(next);
    setThemeState(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const colors = theme === "light" ? LIGHT_COLORS : DARK_COLORS;

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext).colors;
}

export function useThemeControl() {
  return useContext(ThemeContext);
}

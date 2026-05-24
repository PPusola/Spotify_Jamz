// Brand colours — keep all colour values here, never hardcode elsewhere.
// Theme is applied at app startup by reading the persisted preference,
// then mutating the exported COLORS object before any screen renders.

export const DARK_COLORS = {
  primary: "#E91E8C",
  primaryDark: "#B5156C",
  secondary: "#7B5CF5",
  secondaryDark: "#5B3FD5",
  gradientStart: "#E91E8C",
  gradientEnd: "#7B5CF5",
  background: "#0D0D1A",
  surface: "#161628",
  surfaceAlt: "#1E1E3A",
  surfaceHigh: "#252548",
  textPrimary: "#FFFFFF",
  textSecondary: "#9898B8",
  textMuted: "#5A5A80",
  success: "#1DB954",
  liveGreen: "#1DB954",
  error: "#FF5252",
  warning: "#FF9F43",
  roomCode: "#252548",

  // Decorative gradient endpoints used in cards/tiles
  cardGradientStart: "#2A0A4A",
  cardGradientEnd:   "#1E1E3A",
  cardGradientAltStart: "#1A0840",
  cardGradientAltEnd:   "#1E1E3A",
  cardBannerStart: "#2A0A4A",
  cardBannerEnd:   "#1A0835",
};

export const LIGHT_COLORS = {
  primary: "#E91E8C",
  primaryDark: "#B5156C",
  secondary: "#7B5CF5",
  secondaryDark: "#5B3FD5",
  gradientStart: "#E91E8C",
  gradientEnd: "#7B5CF5",
  background: "#F7F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDF5",
  surfaceHigh: "#DEDEEC",
  textPrimary: "#0D0D1A",
  textSecondary: "#4A4A6B",
  textMuted: "#8A8AA8",
  success: "#0F9D58",
  liveGreen: "#1DB954",
  error: "#E53E3E",
  warning: "#FF9F43",
  roomCode: "#DEDEEC",

  // Light variants — soft tinted surfaces, not navy
  cardGradientStart: "#F2EDFB",
  cardGradientEnd:   "#E6DDF6",
  cardGradientAltStart: "#FCE7F1",
  cardGradientAltEnd:   "#EFE5FA",
  cardBannerStart: "#F0E8FA",
  cardBannerEnd:   "#E1D6F1",
};

// Live palette. Mutated in-place by applyTheme() so existing
// `import { COLORS } from "@constants"` references keep working.
export const COLORS = { ...DARK_COLORS };

export function applyTheme(name) {
  const next = name === "light" ? LIGHT_COLORS : DARK_COLORS;
  Object.keys(COLORS).forEach((k) => delete COLORS[k]);
  Object.assign(COLORS, next);
}

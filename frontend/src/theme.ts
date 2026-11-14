// KFIT brand tokens (dark premium identity). Keys match design_guidelines "color" block.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0B0B0B",
  onSurface: "#F5F2EA",
  surfaceSecondary: "#171A18",
  onSurfaceSecondary: "#E8E4DA",
  surfaceTertiary: "#232724",
  onSurfaceTertiary: "#B9B5AB",
  surfaceInverse: "#F5F2EA",
  onSurfaceInverse: "#0B0B0B",
  muted: "#8C8A84",

  brand: "#8A9F8E",
  onBrand: "#0B0B0B",
  brandPrimary: "#8A9F8E",
  onBrandPrimary: "#0B0B0B",
  brandSecondary: "#59665A",
  onBrandSecondary: "#F5F2EA",
  brandTertiary: "#1E2620",
  onBrandTertiary: "#A7B79E",
  sand: "#D8C9B4",
  overlay: "rgba(11,11,11,0.55)",

  success: "#8FBF8F",
  onSuccess: "#0B0B0B",
  warning: "#D8B26E",
  onWarning: "#0B0B0B",
  error: "#E07A6B",
  onError: "#0B0B0B",
  info: "#9DB4C0",
  onInfo: "#0B0B0B",

  border: "#2A2E2B",
  borderStrong: "#3A403B",
  divider: "#1F2220",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

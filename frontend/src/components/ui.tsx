import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { FavType, listFavorites, setFavorite } from "@/src/home";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Emblem({ size = 40 }: { size?: number }) {
  const { colors } = useTheme();
  const s = size;
  return (
    <View style={{ width: s, height: s }} testID="kfit-emblem">
      <View style={{ position: "absolute", left: s * 0.12, top: s * 0.08, width: s * 0.2, height: s * 0.84, backgroundColor: colors.onSurface }} />
      <View style={{ position: "absolute", left: s * 0.3, top: s * 0.26, width: s * 0.66, height: s * 0.17, backgroundColor: colors.brandPrimary, transform: [{ rotate: "-45deg" }] }} />
      <View style={{ position: "absolute", left: s * 0.38, top: s * 0.6, width: s * 0.5, height: s * 0.17, backgroundColor: colors.onSurface, transform: [{ rotate: "45deg" }] }} />
    </View>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.onSurface, fontSize: size, fontWeight: "700", letterSpacing: size * 0.35 }}>KFIT</Text>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, testID, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost"; loading?: boolean;
  disabled?: boolean; icon?: IconName; testID: string; style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fg = variant === "primary" ? colors.onBrandPrimary : colors.onSurface;
  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => (scale.value = withSpring(0.97))}
      onPressOut={() => (scale.value = withSpring(1))}
      style={[s.btn, variant === "primary" ? s.btnPrimary : variant === "secondary" ? s.btnSecondary : s.btnGhost,
        (disabled || loading) && { opacity: 0.5 }, anim, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}

export function Field({ label, testID, ...props }: TextInputProps & { label: string; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput testID={testID} placeholderTextColor={colors.muted} {...props} style={[s.input, props.multiline && s.inputMulti]} />
    </View>
  );
}

/** Cœur « favori » d'un contenu KFIT HOME (programme, vidéo, exercice). */
export function FavoriteButton({ type, id }: { type: FavType; id: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (user) listFavorites(user.user_id, type).then((f) => setOn(f.has(id))).catch(() => {});
  }, [user, type, id]);
  const toggle = () => {
    if (!user) return;
    setOn(!on);
    setFavorite(user.user_id, type, id, !on).catch(() => setOn(on));
  };
  return (
    <Pressable testID="favorite-button" onPress={toggle} style={s.iconBtn} hitSlop={8}>
      <Ionicons name={on ? "heart" : "heart-outline"} size={22} color={on ? colors.brandPrimary : colors.onSurface} />
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange, label, testID }: {
  options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; label?: string; testID: string;
}) {
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {options.map((o) => (
          <Pressable key={o.value} testID={`${testID}-${o.value}`} onPress={() => onChange(o.value)}
            style={[s.chip, value === o.value && s.chipOn]}>
            <Text style={[s.chipText, value === o.value && s.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function StackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="header-back-button" onPress={() => router.back()} style={s.iconBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function ErrorText({ msg }: { msg?: string | null }) {
  const s = useStyles();
  if (!msg) return null;
  return <Text testID="error-message" style={s.error}>{msg}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <Text style={s.section}>{children}</Text>;
}

export const useStyles = makeStyles((c) => ({
  btn: { minHeight: 52, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  btnPrimary: { backgroundColor: c.brandPrimary },
  btnSecondary: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  btnGhost: { backgroundColor: "transparent" },
  btnText: { fontSize: 16, fontWeight: "600", letterSpacing: 0.3 },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "500", letterSpacing: 0.4 },
  input: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.onSurface, paddingHorizontal: spacing.md, height: 52, fontSize: 16 },
  inputMulti: { height: 110, paddingTop: 12, textAlignVertical: "top" },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceSecondary, fontSize: 14, fontWeight: "500" },
  chipTextOn: { color: c.onBrandPrimary },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  headerTitle: { flex: 1, textAlign: "center", color: c.onSurface, fontSize: 17, fontWeight: "600" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  error: { color: c.error, fontSize: 14 },
  section: { color: c.onSurface, fontSize: 18, fontWeight: "700", letterSpacing: 0.2 },
}));

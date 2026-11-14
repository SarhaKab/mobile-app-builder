import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Emblem, IconName, Wordmark } from "@/src/components/ui";
import { LANGS, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const TULUM_IMG = "https://images.unsplash.com/photo-1504730655501-24c39ac53f0e?w=1200";

export default function Welcome() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const features: [IconName, string][] = [["barbell-outline", t("f1")], ["nutrition-outline", t("f2")], ["stats-chart-outline", t("f3")], ["people-outline", t("f4")]];

  return (
    <View style={s.root} testID="welcome-screen">
      <Image source={TULUM_IMG} style={s.bg} contentFit="cover" transition={400} />
      <LinearGradient colors={["transparent", colors.surface]} locations={[0.05, 0.62]} style={s.bg} />
      <View style={[s.top, { paddingTop: insets.top + spacing.md }]}>
        <View style={s.brandRow}><Emblem size={34} /><Wordmark /></View>
        <View style={s.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l} testID={`welcome-lang-${l}`} onPress={() => setLang(l)} style={[s.lang, lang === l && s.langOn]}>
              <Text style={[s.langText, lang === l && s.langTextOn]}>{l.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[s.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.Text entering={FadeInDown.duration(600)} style={s.title}>{t("welcomeTitle")}</Animated.Text>
        <View style={{ gap: 12 }}>
          {features.map(([icon, label], i) => (
            <Animated.View key={label} entering={FadeInDown.delay(150 + i * 90)} style={s.feat}>
              <Ionicons name={icon} size={18} color={colors.brandPrimary} />
              <Text style={s.featText}>{label}</Text>
            </Animated.View>
          ))}
        </View>
        <Text style={s.tagline}>{t("tagline")}</Text>
        <Button testID="welcome-get-started-button" title={t("getStarted")} onPress={() => router.push({ pathname: "/login", params: { mode: "register" } })} />
        <Button testID="welcome-login-button" variant="ghost" title={t("haveAccount")} onPress={() => router.push("/login")} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  langRow: { flexDirection: "row", backgroundColor: c.overlay, borderRadius: radius.pill, padding: 3 },
  lang: { paddingHorizontal: 10, height: 30, justifyContent: "center", borderRadius: radius.pill },
  langOn: { backgroundColor: c.onSurface },
  langText: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  langTextOn: { color: c.surface },
  bottom: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { color: c.onSurface, fontSize: 34, fontWeight: "700", lineHeight: 40, marginBottom: spacing.sm },
  feat: { flexDirection: "row", alignItems: "center", gap: 12 },
  featText: { color: c.onSurfaceSecondary, fontSize: 15 },
  tagline: { color: c.muted, fontSize: 11, letterSpacing: 3, marginTop: spacing.sm },
}));

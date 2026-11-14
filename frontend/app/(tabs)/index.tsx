import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Emblem, IconName, SectionTitle, Wordmark } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TULUM_IMG = "https://images.unsplash.com/photo-1504730655501-24c39ac53f0e?w=1200";

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const load = useCallback(async () => {
    try { setData(await api("/dashboard")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tiles: [IconName, TKey, string][] = [
    ["barbell-outline", "workouts", "/(tabs)/training"], ["nutrition-outline", "nutrition", "/nutrition"],
    ["stats-chart-outline", "progress", "/progress"], ["calendar-outline", "coaching", "/booking"],
  ];
  const p = data?.program;
  const pct = p ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <View style={s.root} testID="home-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Emblem size={28} />
        <Wordmark size={18} />
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottomChrome + spacing.lg }]}
        refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Animated.View entering={FadeInDown.duration(500)} style={s.hero}>
          <Image source={TULUM_IMG} style={s.heroImg} contentFit="cover" transition={300} />
          <LinearGradient colors={[colors.overlay, "transparent", colors.overlay]} style={s.heroImg} />
          <View style={s.heroText}>
            <Text style={s.hello} testID="home-greeting">{t("hello")}, {user?.name?.split(" ")[0]}</Text>
            <Text style={s.helloSub}>{t("letsTrain")}</Text>
          </View>
          <View style={s.loc}><Ionicons name="location-outline" size={14} color={colors.onSurface} /><Text style={s.locText}>Tulum</Text></View>
        </Animated.View>

        <View style={s.tiles}>
          {tiles.map(([icon, key, href], i) => (
            <Animated.View key={key} entering={FadeInDown.delay(80 * i)} style={{ flex: 1 }}>
              <Pressable testID={`home-tile-${key}`} onPress={() => router.push(href as any)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}>
                <Ionicons name={icon} size={24} color={colors.onSurface} />
                <Text style={s.tileText} numberOfLines={1}>{t(key)}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Pressable testID="home-program-card" style={s.program}
          onPress={() => router.push(p ? { pathname: "/program/[id]", params: { id: p.id } } : "/(tabs)/training")}>
          {p && <Image source={p.image} style={s.programImg} contentFit="cover" />}
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.small}>{t("yourProgram")}</Text>
            <Text style={s.programTitle}>{p ? p.title : t("noProgram")}</Text>
            {p ? (
              <>
                <Text style={s.small}>{p.next ? `${t("nextWorkout")} · ${p.next.name} · ${p.next.minutes} ${t("minutes")}` : t("done")}</Text>
                <View style={s.barRow}>
                  <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                  <Text style={s.pct} testID="home-program-percent">{pct}%</Text>
                </View>
              </>
            ) : <Text style={s.link}>{t("browse")} →</Text>}
          </View>
        </Pressable>

        <SectionTitle>{t("stats")}</SectionTitle>
        <View style={s.stats}>
          {[
            [data?.workouts ?? 0, t("workouts")], [data?.minutes ?? 0, t("minutes")],
            [data?.weight ? `${data.weight}` : "—", t("kg")], [data?.calories ?? "—", t("kcal")],
          ].map(([v, l], i) => (
            <View key={i} style={s.stat} testID={`home-stat-${i}`}>
              <Text style={s.statVal}>{v}</Text>
              <Text style={s.small}>{l}</Text>
            </View>
          ))}
        </View>

        <Pressable testID="home-next-booking" style={s.booking} onPress={() => router.push("/booking")}>
          <View style={s.bookIcon}><Ionicons name="calendar" size={20} color={colors.onBrandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.small}>{t("nextSession")}</Text>
            <Text style={s.bookText}>
              {data?.next_booking ? `${data.next_booking.date} · ${data.next_booking.time} · ${t(data.next_booking.type)}` : t("none")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.md, gap: spacing.md, paddingTop: spacing.sm },
  hero: { height: 200, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroText: { padding: spacing.md, gap: 4 },
  hello: { color: c.onSurface, fontSize: 26, fontWeight: "700" },
  helloSub: { color: c.onSurfaceSecondary, fontSize: 18, fontWeight: "500" },
  loc: { position: "absolute", left: spacing.md, bottom: spacing.md, flexDirection: "row", alignItems: "center", gap: 4 },
  locText: { color: c.onSurface, fontSize: 13, fontWeight: "500" },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { height: 84, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 8 },
  tileText: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "500" },
  program: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  programImg: { width: 76, height: 96, borderRadius: radius.md },
  programTitle: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  small: { color: c.muted, fontSize: 12 },
  link: { color: c.brandPrimary, fontWeight: "600" },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: c.brandPrimary },
  pct: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, gap: 2 },
  statVal: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  booking: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.brandTertiary },
  bookIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  bookText: { color: c.onSurface, fontSize: 15, fontWeight: "600", marginTop: 2 },
}));

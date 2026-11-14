import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Chips, ErrorText } from "@/src/components/ui";
import {
  coverUrl, Exercise, FavType, Goal, GOALS, Level, LEVELS, listExercises, listFavorites, listPrograms, listVideos,
  loc, minutesOf, Program, Video,
} from "@/src/home";
import { TKey, useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Kind = "program" | "video" | "exercise";
type Duration = "all" | "short" | "medium" | "long";
const DURATIONS: Record<Exclude<Duration, "all">, (m: number) => boolean> = {
  short: (m) => m <= 20, medium: (m) => m > 20 && m <= 40, long: (m) => m > 40,
};

// KFIT HOME : catalogue des programmes, vidéos et exercices publiés, avec filtres et favoris.
export default function Training() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [kind, setKind] = useState<Kind>("program");
  const [goal, setGoal] = useState<Goal | "all">("all");
  const [level, setLevel] = useState<Level | "all">("all");
  const [duration, setDuration] = useState<Duration>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [data, setData] = useState<{ program: Program[]; video: Video[]; exercise: Exercise[] } | null>(null);
  const [favs, setFavs] = useState<Record<FavType, Set<string>>>({ program: new Set(), video: new Set(), exercise: new Set() });
  const [err, setErr] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    Promise.all([listPrograms(), listVideos(), listExercises(),
      listFavorites(user.user_id, "program"), listFavorites(user.user_id, "video"), listFavorites(user.user_id, "exercise")])
      .then(([program, video, exercise, fp, fv, fe]) => {
        setData({ program, video, exercise }); setFavs({ program: fp, video: fv, exercise: fe }); setErr(false);
      })
      .catch(() => { setErr(true); setData((d) => d ?? { program: [], video: [], exercise: [] }); });
  }, [user]));

  const items = useMemo(() => {
    if (!data) return [];
    return (data[kind] as (Program | Video | Exercise)[]).filter((it: any) => {
      if (favOnly && !favs[kind].has(it.id)) return false;
      if (level !== "all" && it.level !== level) return false;
      if (kind !== "exercise" && goal !== "all" && it.goal !== goal) return false;
      if (kind === "video" && duration !== "all") {
        const m = minutesOf(it);
        if (m == null || !DURATIONS[duration](m)) return false;
      }
      return true;
    });
  }, [data, kind, goal, level, duration, favOnly, favs]);

  const open = (it: any) => router.push({ pathname: `/${kind}/[id]`, params: { id: it.id } } as any);
  const all = { value: "all" as const, label: t("all") };

  return (
    <View style={s.root} testID="training-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={s.title}>KFIT HOME</Text>
        <View style={s.actions}>
          <Pressable testID="catalog-favorites-toggle" onPress={() => setFavOnly(!favOnly)} style={s.iconBtn} hitSlop={6}>
            <Ionicons name={favOnly ? "heart" : "heart-outline"} size={22} color={favOnly ? colors.brandPrimary : colors.onSurface} />
          </Pressable>
          <Pressable testID="catalog-history-button" onPress={() => router.push("/history" as any)} style={s.iconBtn} hitSlop={6}>
            <Ionicons name="time-outline" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>
      <View style={s.filters}>
        <Chips testID="catalog-kind" value={kind} onChange={setKind}
          options={[{ value: "program", label: t("programs") }, { value: "video", label: t("videos") }, { value: "exercise", label: t("exercises") }]} />
        {kind !== "exercise" && (
          <Chips testID="catalog-goal" value={goal} onChange={setGoal}
            options={[all, ...GOALS.map((g) => ({ value: g, label: t(`goal_${g}` as TKey) }))]} />
        )}
        <Chips testID="catalog-level" value={level} onChange={setLevel}
          options={[{ value: "all", label: t("allLevels") }, ...LEVELS.map((l) => ({ value: l, label: t(l) }))]} />
        {kind === "video" && (
          <Chips testID="catalog-duration" value={duration} onChange={setDuration}
            options={[{ value: "all", label: t("allDurations") }, { value: "short", label: "≤ 20 min" }, { value: "medium", label: "20–40 min" }, { value: "long", label: "> 40 min" }]} />
        )}
      </View>
      {!data ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={[s.list, { paddingBottom: bottomChrome + spacing.lg }]}
          ListHeaderComponent={<ErrorText msg={err ? t("error") : null} />}
          ListEmptyComponent={
            <View style={s.empty} testID="catalog-empty">
              <Ionicons name="film-outline" size={36} color={colors.muted} />
              <Text style={s.emptyText}>{favOnly ? t("noFavorites") : data[kind].length ? t("noMatch") : t("noContent")}</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => kind === "program" ? (
            <Pressable testID={`program-card-${item.slug}`} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} onPress={() => open(item)}>
              {coverUrl(item.cover_path) && <Image source={coverUrl(item.cover_path)} style={s.img} contentFit="cover" transition={300} />}
              <LinearGradient colors={["transparent", colors.surface]} locations={[0.2, 1]} style={s.img} />
              <View style={s.cardBody}>
                <View style={s.badges}>
                  <Text style={s.badge}>{t(item.level)}</Text>
                  {item.goal && <Text style={s.badge}>{t(`goal_${item.goal}` as TKey)}</Text>}
                  {item.is_premium && <Text style={[s.badge, s.badgeOn]}>Premium</Text>}
                </View>
                <Text style={s.cardTitle}>{loc(item.title, lang)}</Text>
                <Text style={s.desc} numberOfLines={2}>{loc(item.description, lang)}</Text>
                <Text style={s.meta}>{item.weeks ? `${item.weeks} ${t("weeks")} · ` : ""}{item.videos?.[0]?.count ?? 0} {t("sessions")}</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable testID={`${kind}-row-${item.id}`} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]} onPress={() => open(item)}>
              <View style={s.rowIcon}><Ionicons name={kind === "video" ? "play" : "barbell-outline"} size={20} color={colors.onBrandTertiary} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{loc(kind === "video" ? item.title : item.name, lang)}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>
                  {[kind === "video" ? loc(item.program?.title, lang) : item.muscle_groups?.map((m: string) => t(`m_${m}` as TKey) ?? m).join(", "),
                    kind === "video" && minutesOf(item) ? `${minutesOf(item)} ${t("minutes")}` : null,
                    item.level ? t(item.level) : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {favs[kind].has(item.id) && <Ionicons name="heart" size={16} color={colors.brandPrimary} />}
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: 2 },
  actions: { flexDirection: "row" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  filters: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
  list: { padding: spacing.md, gap: spacing.md },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  card: { height: 240, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary, justifyContent: "flex-end" },
  img: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  cardBody: { padding: spacing.md, gap: 4 },
  badges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  badge: { color: c.onSurface, backgroundColor: c.overlay, fontSize: 11, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  badgeOn: { backgroundColor: c.brandPrimary, color: c.onBrandPrimary },
  cardTitle: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  desc: { color: c.onSurfaceSecondary, fontSize: 14 },
  meta: { color: c.brandPrimary, fontSize: 12, fontWeight: "600", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 68, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
  rowMeta: { color: c.muted, fontSize: 12 },
}));

import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, FavoriteButton, StackHeader } from "@/src/components/ui";
import { coverUrl, doneVideoIds, enroll, getProgram, isEnrolled, listHistory, loc, minutesOf, Program, programVideos, Video } from "@/src/home";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ProgramDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ p: Program | null; videos: Video[]; done: Set<string>; enrolled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    Promise.all([getProgram(id), programVideos(id), listHistory(user.user_id), isEnrolled(user.user_id, id)])
      .then(([p, videos, history, enrolled]) => { setState({ p, videos, done: doneVideoIds(history, id), enrolled }); setErr(false); })
      .catch(() => { setErr(true); setState((x) => x ?? { p: null, videos: [], done: new Set(), enrolled: false }); });
  }, [id, user]));

  const start = async () => {
    if (!user || !state) return;
    setBusy(true);
    try { await enroll(user.user_id, id); setState({ ...state, enrolled: true }); setErr(false); } catch { setErr(true); } finally { setBusy(false); }
  };

  const p = state?.p;
  return (
    <View style={s.root} testID="program-detail-screen">
      <StackHeader title={p ? loc(p.title, lang) : ""} right={p ? <FavoriteButton type="program" id={p.id} /> : undefined} />
      {!state ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : !p ? (
        <Text style={s.missing} testID="program-missing">{err ? t("error") : t("notFound")}</Text>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          {coverUrl(p.cover_path) && <Image source={coverUrl(p.cover_path)} style={s.img} contentFit="cover" transition={300} />}
          <Text style={s.meta} testID="program-progress">
            {[t(p.level), p.goal ? t(`goal_${p.goal}` as TKey) : null, p.weeks ? `${p.weeks} ${t("weeks")}` : null,
              `${state.videos.filter((v) => state.done.has(v.id)).length}/${state.videos.length}`].filter(Boolean).join(" · ")}
          </Text>
          <Text style={s.desc}>{loc(p.description, lang)}</Text>
          {p.coach && (
            <View style={s.coach} testID="program-coach">
              <Ionicons name="person-circle-outline" size={32} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={s.coachName}>{p.coach.display_name}</Text>
                {!!p.coach.headline && <Text style={s.small}>{p.coach.headline}</Text>}
              </View>
            </View>
          )}
          <ErrorText msg={err ? t("error") : null} />
          {state.enrolled ? (
            <View style={s.enrolled} testID="program-enrolled-badge">
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              <Text style={s.enrolledText}>{t("enrolled")}</Text>
            </View>
          ) : <Button testID="program-enroll-button" title={t("enroll")} onPress={start} loading={busy} />}

          {state.videos.length === 0 && <Text style={s.small}>{t("noSessions")}</Text>}
          {state.videos.map((v, i) => {
            const done = state.done.has(v.id);
            return (
              <Pressable key={v.id} testID={`program-session-${i}`} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: "/video/[id]", params: { id: v.id } } as any)}>
                <View style={[s.num, done && s.numDone]}>
                  {done ? <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} /> : <Text style={s.numText}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.wName}>{loc(v.title, lang)}</Text>
                  <Text style={s.small}>{[minutesOf(v) ? `${minutesOf(v)} ${t("minutes")}` : null, done ? t("completed") : null].filter(Boolean).join(" · ")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  missing: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  img: { height: 200, borderRadius: radius.lg },
  meta: { color: c.brandPrimary, fontSize: 13, fontWeight: "600" },
  desc: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  small: { color: c.muted, fontSize: 12, marginTop: 2 },
  coach: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  coachName: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  enrolled: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  enrolledText: { color: c.onBrandTertiary, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 64, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  num: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  numDone: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  numText: { color: c.onSurface, fontWeight: "600" },
  wName: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
}));

import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, FavoriteButton, SectionTitle, StackHeader } from "@/src/components/ui";
import { completeVideo, getVideo, listHistory, loc, minutesOf, Video, VideoExercise, videoExercises } from "@/src/home";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Fiche d'une séance vidéo. La lecture vidéo n'est pas encore intégrée : tant qu'aucun
// fichier n'est disponible, l'écran l'indique clairement et présente le détail de la séance.
export default function VideoDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ v: Video | null; exercises: VideoExercise[]; times: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    Promise.all([getVideo(id), videoExercises(id), listHistory(user.user_id)])
      .then(([v, exercises, history]) => { setState({ v, exercises, times: history.filter((h) => h.video_id === id).length }); setErr(false); })
      .catch(() => { setErr(true); setState((x) => x ?? { v: null, exercises: [], times: 0 }); });
  }, [id, user]));

  const complete = async () => {
    if (!user || !state?.v) return;
    setBusy(true);
    try { await completeVideo(user.user_id, state.v); setState({ ...state, times: state.times + 1 }); setErr(false); } catch { setErr(true); } finally { setBusy(false); }
  };

  const v = state?.v;
  return (
    <View style={s.root} testID="video-detail-screen">
      <StackHeader title={v ? loc(v.title, lang) : ""} right={v ? <FavoriteButton type="video" id={v.id} /> : undefined} />
      {!state ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : !v ? (
        <Text style={s.missing} testID="video-missing">{err ? t("error") : t("notFound")}</Text>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.player} testID="video-unavailable">
            <Ionicons name="videocam-off-outline" size={32} color={colors.muted} />
            <Text style={s.playerText}>{t("videoUnavailable")}</Text>
          </View>
          <Text style={s.meta}>
            {[loc(v.program?.title, lang), minutesOf(v) ? `${minutesOf(v)} ${t("minutes")}` : null, v.level ? t(v.level) : null,
              v.goal ? t(`goal_${v.goal}` as TKey) : null].filter(Boolean).join(" · ")}
          </Text>
          {!!loc(v.description, lang) && <Text style={s.desc}>{loc(v.description, lang)}</Text>}

          {state.exercises.length > 0 && <SectionTitle>{t("exercises")}</SectionTitle>}
          {state.exercises.map((e) => (
            <Pressable key={e.exercise.id} testID={`video-exercise-${e.position}`} style={({ pressed }) => [s.ex, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: e.exercise.id } } as any)}>
              <Text style={s.exName}>{loc(e.exercise.name, lang)}</Text>
              <Text style={s.exMeta}>{[e.sets ? `${e.sets} ${t("sets")}` : null, e.reps].filter(Boolean).join(" × ")}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}

          <ErrorText msg={err ? t("error") : null} />
          {state.times > 0 && <Text style={s.done} testID="video-done-count">✓ {t("completed")} × {state.times}</Text>}
          <Button testID="video-complete-button" icon="checkmark" variant={state.times ? "secondary" : "primary"}
            title={state.times ? t("doneAgain") : t("markDone")} onPress={complete} loading={busy} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  missing: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  player: { height: 190, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md },
  playerText: { color: c.muted, fontSize: 13, textAlign: "center" },
  meta: { color: c.brandPrimary, fontSize: 13, fontWeight: "600" },
  desc: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  ex: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 52, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  exName: { flex: 1, color: c.onSurface, fontSize: 15 },
  exMeta: { color: c.muted, fontSize: 13 },
  done: { color: c.success, fontWeight: "600", textAlign: "center" },
}));

import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Chips, FavoriteButton, SectionTitle, StackHeader } from "@/src/components/ui";
import { VideoPlayer } from "@/src/components/video-player";
import { Exercise, getExercise, isDraftMedia, Level, LEVELS, loc } from "@/src/home";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ExerciseDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ e: Exercise | null; err: boolean } | null>(null);
  const [picked, setPicked] = useState<Level | null>(null);

  useFocusEffect(useCallback(() => {
    getExercise(id).then((e) => setState({ e, err: false })).catch(() => setState({ e: null, err: true }));
  }, [id]));

  const e = state?.e;
  // Muscles et matériel sont des codes traduits ; une valeur libre saisie en administration est affichée telle quelle.
  const names = (prefix: "m_" | "eq_", codes: string[]) => codes.map((c) => t(`${prefix}${c}` as TKey) ?? c).join(", ") || "—";
  const rows: [string, string][] = e ? [
    [t("level"), e.level ? t(e.level) : "—"], [t("muscles"), names("m_", e.muscle_groups)], [t("equipment"), names("eq_", e.equipment)],
  ] : [];
  const levels = e ? LEVELS.filter((l) => e.level_variants?.[l]) : [];
  const level = picked && levels.includes(picked) ? picked : levels.includes(e?.level as Level) ? (e!.level as Level) : levels[0];
  const variant = level ? e!.level_variants[level]! : null;
  // Une vidéo brouillon (non validée) n'est montrée qu'aux administrateurs.
  const draft = isDraftMedia(e?.media_path);
  const media = draft && user?.role !== "admin" ? null : e?.media_path;

  return (
    <View style={s.root} testID="exercise-detail-screen">
      <StackHeader title={e ? loc(e.name, lang) : ""} right={e ? <FavoriteButton type="exercise" id={e.id} /> : undefined} />
      {!state ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : !e ? (
        <Text style={s.missing} testID="exercise-missing">{state.err ? t("error") : t("notFound")}</Text>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <VideoPlayer path={media} title={loc(e.name, lang)} />
          {!!media && draft && <Text style={s.draft} testID="exercise-video-draft">{t("videoDraft")}</Text>}
          <View style={s.group}>
            {rows.map(([label, value]) => (
              <View key={label} style={s.row}>
                <Text style={s.label}>{label}</Text>
                <Text style={s.value}>{value}</Text>
              </View>
            ))}
          </View>

          {variant && (
            <>
              <SectionTitle>{t("byLevel")}</SectionTitle>
              <Chips testID="exercise-level" value={level} onChange={setPicked} options={levels.map((l) => ({ value: l, label: t(l) }))} />
              <View style={s.stats} testID="exercise-variant">
                {([[variant.sets, t("sets")], [variant.reps, t("reps")],
                  [variant.rest_seconds != null ? `${variant.rest_seconds} s` : null, t("rest")]] as [string | number | null | undefined, string][])
                  .map(([value, label]) => (
                    <View key={label} style={s.stat}>
                      <Text style={s.statValue}>{value ?? "—"}</Text>
                      <Text style={s.statLabel}>{label}</Text>
                    </View>
                  ))}
              </View>
              {!!loc(variant.note, lang) && <Text style={s.text} testID="exercise-variant-note">{loc(variant.note, lang)}</Text>}
            </>
          )}

          <SectionTitle>{t("instructions")}</SectionTitle>
          <Text style={s.text} testID="exercise-instructions">{loc(e.instructions, lang) || t("noInstructions")}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  missing: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  draft: { color: c.warning, fontSize: 13, fontWeight: "600", textAlign: "center" },
  group: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, paddingHorizontal: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  label: { color: c.muted, fontSize: 14 },
  value: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "500", textAlign: "right" },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  statValue: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  statLabel: { color: c.muted, fontSize: 12 },
  text: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
}));

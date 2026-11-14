import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FavoriteButton, SectionTitle, StackHeader } from "@/src/components/ui";
import { Exercise, getExercise, loc } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ExerciseDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ e: Exercise | null; err: boolean } | null>(null);

  useEffect(() => {
    getExercise(id).then((e) => setState({ e, err: false })).catch(() => setState({ e: null, err: true }));
  }, [id]);

  const e = state?.e;
  const rows: [string, string][] = e ? [
    [t("level"), e.level ? t(e.level) : "—"], [t("muscles"), e.muscle_groups.join(", ") || "—"], [t("equipment"), e.equipment.join(", ") || "—"],
  ] : [];
  return (
    <View style={s.root} testID="exercise-detail-screen">
      <StackHeader title={e ? loc(e.name, lang) : ""} right={e ? <FavoriteButton type="exercise" id={e.id} /> : undefined} />
      {!state ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : !e ? (
        <Text style={s.missing} testID="exercise-missing">{state.err ? t("error") : t("notFound")}</Text>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.group}>
            {rows.map(([label, value]) => (
              <View key={label} style={s.row}>
                <Text style={s.label}>{label}</Text>
                <Text style={s.value}>{value}</Text>
              </View>
            ))}
          </View>
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
  group: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, paddingHorizontal: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  label: { color: c.muted, fontSize: 14 },
  value: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "500", textAlign: "right" },
  text: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
}));

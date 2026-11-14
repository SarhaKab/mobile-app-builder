import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { StackHeader } from "@/src/components/ui";
import { HistoryRow, listHistory, loc } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Historique des entraînements terminés (KFIT HOME).
export default function History() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ rows: HistoryRow[]; err: boolean } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    listHistory(user.user_id).then((rows) => setState({ rows, err: false })).catch(() => setState({ rows: [], err: true }));
  }, [user]));

  const minutes = state?.rows.reduce((n, h) => n + (h.minutes ?? 0), 0) ?? 0;
  return (
    <View style={s.root} testID="history-screen">
      <StackHeader title={t("workoutHistory")} />
      {!state ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={state.rows}
          keyExtractor={(h) => h.id}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}
          ListHeaderComponent={
            <View style={s.totals}>
              <View style={s.total}><Text style={s.big} testID="history-total-workouts">{state.rows.length}</Text><Text style={s.small}>{t("workouts")}</Text></View>
              <View style={s.total}><Text style={s.big} testID="history-total-minutes">{minutes}</Text><Text style={s.small}>{t("totalMin")}</Text></View>
            </View>
          }
          ListEmptyComponent={<Text style={s.empty} testID="history-empty">{state.err ? t("error") : t("noHistory")}</Text>}
          renderItem={({ item }) => (
            <View style={s.row} testID="history-row">
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{loc(item.video?.title, lang) || loc(item.program?.title, lang) || t("deletedContent")}</Text>
                <Text style={s.small}>
                  {[item.video ? loc(item.program?.title, lang) : null, new Date(item.completed_at).toLocaleDateString(lang)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {!!item.minutes && <Text style={s.min}>{item.minutes} {t("minutes")}</Text>}
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  totals: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  total: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, gap: 2 },
  big: { color: c.onSurface, fontSize: 24, fontWeight: "700" },
  small: { color: c.muted, fontSize: 12 },
  empty: { color: c.muted, textAlign: "center", marginTop: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  title: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  min: { color: c.brandPrimary, fontSize: 13, fontWeight: "600" },
}));

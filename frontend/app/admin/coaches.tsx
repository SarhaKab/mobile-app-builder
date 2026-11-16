import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Chips, ErrorText, StackHeader } from "@/src/components/ui";
import { COACH_STATUSES, CoachProfile, CoachStatus, formatMoney, listCoachFiles } from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Administration T7 CORP — file des dossiers coachs à vérifier.
// Réservée à l'équipe (admin, support) ; la base applique la même règle.
export default function AdminCoaches() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isStaff = user?.role === "admin" || user?.role === "support";
  const [status, setStatus] = useState<CoachStatus>("under_review");
  const [files, setFiles] = useState<CoachProfile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return;
    let live = true;
    setFiles(null); setErr(null);
    listCoachFiles(status).then((list) => live && setFiles(list)).catch(() => { if (live) { setErr(t("error")); setFiles([]); } });
    return () => { live = false; };
  }, [isStaff, status, t]));

  if (!isStaff) {
    return (
      <View style={s.root} testID="admin-coaches-denied">
        <StackHeader title={t("adminCoaches")} />
        <Text style={s.denied}>{t("staffOnly")}</Text>
      </View>
    );
  }
  return (
    <View style={s.root} testID="admin-coaches-screen">
      <StackHeader title={t("adminCoaches")} />
      <View style={s.top}>
        <Chips testID="admin-coaches-status" value={status} onChange={setStatus}
          options={COACH_STATUSES.map((v) => ({ value: v, label: t(`cs_${v}` as TKey) }))} />
        <ErrorText msg={err} />
      </View>
      {!files ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={files}
          keyExtractor={(c) => c.user_id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
          ListEmptyComponent={<Text style={s.empty} testID="admin-coaches-empty">{t("adminCoachesEmpty")}</Text>}
          renderItem={({ item }) => (
            <Pressable testID={`admin-coach-row-${item.user_id}`} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: "/admin/coach", params: { id: item.user_id } } as any)}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title} numberOfLines={1}>{item.display_name || "—"}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {formatMoney(item.hourly_rate_cents, item.currency)} {t("perHour")} · {item.specialties.map((v) => t(`sp_${v}` as TKey)).join(", ") || "—"}
                </Text>
              </View>
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
  denied: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  top: { padding: spacing.md, gap: spacing.sm },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  empty: { color: c.muted, textAlign: "center", marginVertical: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 64, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  title: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  meta: { color: c.muted, fontSize: 12 },
}));

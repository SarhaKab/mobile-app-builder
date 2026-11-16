import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Chips, ErrorText, Field, IconName, SectionTitle, StackHeader } from "@/src/components/ui";
import {
  appealDecision, CoachProfile, formatMoney, getCoach, listMarkets, Market, missingRequirements, saveCoach,
  startCoachRegistration, submitForReview,
} from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Espace professionnel coach — tableau de bord du dossier.
// Un coach n'est visible des clients et ne reçoit de missions qu'après validation humaine par KFIT.
const STEPS: { key: TKey; icon: IconName; href: string; needs: (m: string[]) => boolean }[] = [
  { key: "proStepProfile", icon: "person-circle-outline", href: "/pro/profile", needs: (m) => ["display_name", "bio", "specialties", "hourly_rate"].some((k) => m.includes(k)) },
  { key: "proStepAvailability", icon: "calendar-outline", href: "/pro/availability", needs: (m) => m.includes("availability") },
  { key: "proStepArea", icon: "location-outline", href: "/pro/area", needs: (m) => m.includes("service_area") },
  { key: "proStepDocuments", icon: "document-attach-outline", href: "/pro/documents", needs: (m) => m.some((k) => k.startsWith("doc_")) },
];

export default function ProSpace() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [coach, setCoach] = useState<CoachProfile | null | undefined>(undefined);
  const [missing, setMissing] = useState<string[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [market, setMarket] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [appeal, setAppeal] = useState("");
  const isStaff = user?.role === "admin" || user?.role === "support";

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const c = await getCoach(user.user_id);
      setCoach(c);
      if (c) setMissing(await missingRequirements(user.user_id));
      else {
        const list = await listMarkets();
        setMarkets(list);
        setMarket((m) => m ?? list[0]?.code);
      }
    } catch {
      setMsg({ ok: false, text: t("error") });
      setCoach((c) => (c === undefined ? null : c));
    }
  }, [user, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn: () => Promise<unknown>, okText?: TKey) => {
    setBusy(true); setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: t(okText) });
      await load();
    } catch {
      setMsg({ ok: false, text: t("error") });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const message = msg && (msg.ok ? <Text style={s.ok} testID="pro-message">{msg.text}</Text> : <ErrorText msg={msg.text} />);

  if (coach === undefined) {
    return (
      <View style={s.root} testID="pro-loading">
        <StackHeader title={t("proSpace")} />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  // --- Pas encore de dossier : présentation et ouverture de l'inscription
  if (!coach) {
    return (
      <View style={s.root} testID="pro-intro">
        <StackHeader title={t("becomeCoach")} />
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={s.h1}>{t("proIntroTitle")}</Text>
          <Text style={s.body}>{t("proIntroBody")}</Text>
          <View style={s.card}>
            {(["proFree1", "proFree2", "proFree3", "proFree4"] as TKey[]).map((k) => (
              <View key={k} style={s.line}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.brandPrimary} />
                <Text style={s.lineText}>{t(k)}</Text>
              </View>
            ))}
          </View>
          {isStaff ? <Text style={s.body} testID="pro-staff-note">{t("staffOnly")}</Text> : (
            <>
              {markets.length > 1 && (
                <Chips testID="pro-market" label={t("proMarket")} value={market} onChange={setMarket}
                  options={markets.map((m) => ({ value: m.code, label: m.name }))} />
              )}
              {message}
              <Button testID="pro-start-button" title={t("proStart")} loading={busy} disabled={!market}
                onPress={() => run(async () => { await startCoachRegistration(market!); await refresh(); })} />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // --- Dossier existant
  const editable = coach.status === "registration_in_progress" || coach.status === "documents_missing";
  const tone = coach.status === "approved" ? colors.success
    : coach.status === "rejected" || coach.status === "suspended" ? colors.error : colors.warning;

  return (
    <View style={s.root} testID="pro-screen">
      <StackHeader title={t("proSpace")} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>{t("proStatus")}</Text>
          <View style={s.line}>
            <View style={[s.dot, { backgroundColor: tone }]} />
            <Text style={s.status} testID="pro-status">{t(`cs_${coach.status}` as TKey)}</Text>
          </View>
          <Text style={s.body}>{t(`csHint_${coach.status}` as TKey)}</Text>
          {!!coach.status_reason && (
            <View style={s.reason} testID="pro-status-reason">
              <Text style={s.label}>{t("proReason")}</Text>
              <Text style={s.lineText}>{coach.status_reason}</Text>
            </View>
          )}
          {coach.hourly_rate_cents != null && (
            <Text style={s.meta}>{formatMoney(coach.hourly_rate_cents, coach.currency)} {t("perHour")}</Text>
          )}
        </View>

        <View style={s.group}>
          {STEPS.map((step, i) => {
            const todo = step.needs(missing);
            return (
              <Pressable key={step.href} testID={`pro-step-${step.href.split("/").pop()}`} onPress={() => router.push(step.href as any)}
                style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <Ionicons name={step.icon} size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{t(step.key)}</Text>
                  <Text style={[s.rowSub, { color: todo ? colors.warning : colors.success }]}>{t(todo ? "proStepTodo" : "proStepDone")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>

        {message}

        {editable && (
          <>
            {missing.length > 0 && <Text style={s.meta} testID="pro-incomplete">{t("proIncomplete")}</Text>}
            <Button testID="pro-submit-button" title={t("proSubmit")} icon="send-outline" loading={busy} disabled={missing.length > 0}
              onPress={() => run(() => submitForReview(user.user_id), "proSubmitted")} />
          </>
        )}

        {coach.status === "approved" && (
          <>
            {coach.is_paused && <Text style={s.meta} testID="pro-paused-note">{t("proPausedNote")}</Text>}
            <Button testID="pro-pause-button" variant="secondary" icon={coach.is_paused ? "play-outline" : "pause-outline"}
              title={t(coach.is_paused ? "proResume" : "proPause")} loading={busy}
              onPress={() => run(() => saveCoach(user.user_id, { is_paused: !coach.is_paused }))} />
          </>
        )}

        {(coach.status === "rejected" || coach.status === "suspended") && (
          <>
            <SectionTitle>{t("proAppeal")}</SectionTitle>
            <Field testID="pro-appeal-input" label={t("proAppealPlaceholder")} value={appeal} onChangeText={setAppeal} multiline maxLength={2000} />
            <Button testID="pro-appeal-button" variant="secondary" title={t("proAppeal")} loading={busy} disabled={appeal.trim().length < 10}
              onPress={() => run(async () => { await appealDecision(user.user_id, appeal.trim()); setAppeal(""); }, "proAppealSent")} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  h1: { color: c.onSurface, fontSize: 26, fontWeight: "700" },
  body: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineText: { flex: 1, color: c.onSurface, fontSize: 15, lineHeight: 21 },
  label: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  reason: { gap: 4, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  meta: { color: c.muted, fontSize: 13, lineHeight: 19 },
  ok: { color: c.success, fontSize: 14, fontWeight: "600" },
  group: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 64 },
  rowText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
}));

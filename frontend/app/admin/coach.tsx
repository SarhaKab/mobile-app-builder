import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, Field, SectionTitle, StackHeader } from "@/src/components/ui";
import {
  CoachDocument, CoachProfile, formatMoney, getCoach, getServiceArea, hhmm, listDocuments, listSlots, missingRequirements,
  reviewCoach, reviewDocument, ReviewState, ServiceArea, signedDocumentUrl, Slot,
} from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Decision = "approved" | "documents_missing" | "rejected" | "suspended";
type FileData = { coach: CoachProfile; docs: CoachDocument[]; slots: Slot[]; area: ServiceArea | null; missing: string[] };

// Administration T7 CORP — examen d'un dossier coach.
// La vérification professionnelle est humaine : la personne ouvre chaque pièce, l'approuve ou la refuse,
// puis rend une décision motivée. La base journalise la décision et notifie le coach.
export default function AdminCoachFile() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isStaff = user?.role === "admin" || user?.role === "support";
  const [data, setData] = useState<FileData | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!isStaff || !id) return;
    try {
      const [coach, docs, slots, area, missing] = await Promise.all([
        getCoach(id), listDocuments(id), listSlots(id), getServiceArea(id), missingRequirements(id),
      ]);
      if (coach) setData({ coach, docs, slots, area, missing });
      else setMsg({ ok: false, text: t("error") });
    } catch {
      setMsg({ ok: false, text: t("error") });
    }
  }, [isStaff, id, t]);
  useEffect(() => { load(); }, [load]);

  const open = async (doc: CoachDocument) => {
    try { await Linking.openURL(await signedDocumentUrl(doc.storage_path)); } catch { setMsg({ ok: false, text: t("error") }); }
  };
  const decideDoc = async (doc: CoachDocument, state: ReviewState) => {
    setBusy(doc.id); setMsg(null);
    try { await reviewDocument(doc.id, state, state === "rejected" ? reason.trim() || null : null); await load(); }
    catch { setMsg({ ok: false, text: t("error") }); } finally { setBusy(null); }
  };
  const decide = async (status: Decision) => {
    if (!id) return;
    if (status !== "approved" && !reason.trim()) return setMsg({ ok: false, text: t("adminReasonRequired") });
    setBusy(status); setMsg(null);
    try {
      await reviewCoach(id, status, status === "approved" ? null : reason.trim());
      setReason("");
      await load();
      setMsg({ ok: true, text: t("adminDecisionSaved") });
    } catch (e: any) {
      const m: string = e?.message ?? "";
      setMsg({ ok: false, text: /required document|incomplete/.test(m) ? t("adminDocsNotApproved") : t("error") });
    } finally {
      setBusy(null);
    }
  };

  if (!isStaff) {
    return (
      <View style={s.root} testID="admin-coach-denied">
        <StackHeader title={t("adminCoachFile")} />
        <Text style={s.denied}>{t("staffOnly")}</Text>
      </View>
    );
  }
  const c = data?.coach;
  const stateColor = (st: ReviewState) => (st === "approved" ? colors.success : st === "rejected" ? colors.error : colors.warning);

  return (
    <View style={s.root} testID="admin-coach-screen">
      <StackHeader title={t("adminCoachFile")} />
      {!data || !c ? (msg ? <View style={s.content}><ErrorText msg={msg.text} /></View> : <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.card}>
            <Text style={s.name} testID="admin-coach-name">{c.display_name || "—"}</Text>
            <Text style={s.status} testID="admin-coach-status">{t(`cs_${c.status}` as TKey)}{c.is_paused ? " · ⏸" : ""}</Text>
            {!!c.status_reason && <Text style={s.body}>{t("proReason")} : {c.status_reason}</Text>}
            {!!c.headline && <Text style={s.body}>{c.headline}</Text>}
            {!!c.bio && <Text style={s.body}>{c.bio}</Text>}
            <Text style={s.meta}>{t("proSpecialties")} : {c.specialties.map((v) => t(`sp_${v}` as TKey)).join(", ") || "—"}</Text>
            <Text style={s.meta}>{t("proRate")} : {formatMoney(c.hourly_rate_cents, c.currency)} {t("perHour")}</Text>
            {c.experience_years != null && <Text style={s.meta}>{t("proYears")} : {c.experience_years} {t("years")}</Text>}
            {!!c.experience_summary && <Text style={s.body}>{c.experience_summary}</Text>}
            <Text style={s.meta}>{t("proStepArea")} : {data.area ? `${data.area.label || "—"} · ${data.area.radius_km} km` : "—"}</Text>
            <Text style={s.meta}>
              {t("proStepAvailability")} : {data.slots.map((sl) => `${t(`day_${sl.weekday}` as TKey)} ${hhmm(sl.start_time)}–${hhmm(sl.end_time)}`).join(" · ") || "—"}
            </Text>
          </View>

          {data.missing.length > 0 && (
            <View style={s.card} testID="admin-coach-missing">
              <Text style={s.label}>{t("adminMissing")}</Text>
              {data.missing.map((k) => <Text key={k} style={s.body}>• {t((k.startsWith("doc_") ? k : `req_${k}`) as TKey)}</Text>)}
            </View>
          )}

          <SectionTitle>{t("proStepDocuments")}</SectionTitle>
          <Text style={s.meta}>{t("adminHumanCheck")}</Text>
          {data.docs.length === 0 && <Text style={s.meta}>—</Text>}
          {data.docs.map((doc) => (
            <View key={doc.id} style={s.card} testID={`admin-doc-${doc.id}`}>
              <Text style={s.docTitle}>{t(`doc_${doc.type}` as TKey)}</Text>
              <Text style={[s.status, { color: stateColor(doc.state) }]}>{t(`ds_${doc.state}` as TKey)}</Text>
              {!!doc.review_note && <Text style={s.meta}>{t("proDocNote")} : {doc.review_note}</Text>}
              <View style={s.actions}>
                <Pressable testID={`admin-doc-open-${doc.id}`} onPress={() => open(doc)} style={s.action}><Text style={s.actionText}>{t("proOpen")}</Text></Pressable>
                <Pressable testID={`admin-doc-approve-${doc.id}`} onPress={() => decideDoc(doc, "approved")} disabled={busy !== null} style={s.action}>
                  <Text style={[s.actionText, { color: colors.success }]}>{t("adminApproveDoc")}</Text>
                </Pressable>
                <Pressable testID={`admin-doc-reject-${doc.id}`} onPress={() => decideDoc(doc, "rejected")} disabled={busy !== null} style={s.action}>
                  <Text style={[s.actionText, { color: colors.error }]}>{t("adminRejectDoc")}</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <SectionTitle>{t("adminDecision")}</SectionTitle>
          <Field testID="admin-coach-reason" label={t("adminReasonLabel")} value={reason} onChangeText={setReason} multiline maxLength={1000} />
          {msg && (msg.ok ? <Text style={s.ok} testID="admin-coach-message">{msg.text}</Text> : <ErrorText msg={msg.text} />)}
          <Button testID="admin-coach-approve" title={t("adminApprove")} icon="shield-checkmark-outline" onPress={() => decide("approved")}
            loading={busy === "approved"} disabled={busy !== null} />
          <Button testID="admin-coach-ask-docs" variant="secondary" title={t("adminAskDocs")} onPress={() => decide("documents_missing")}
            loading={busy === "documents_missing"} disabled={busy !== null} />
          <Button testID="admin-coach-reject" variant="secondary" title={t("adminReject")} onPress={() => decide("rejected")}
            loading={busy === "rejected"} disabled={busy !== null} />
          <Button testID="admin-coach-suspend" variant="secondary" title={t("adminSuspend")} onPress={() => decide("suspended")}
            loading={busy === "suspended"} disabled={busy !== null} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  denied: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md },
  card: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  name: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  status: { color: c.brandPrimary, fontSize: 14, fontWeight: "600" },
  body: { color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  meta: { color: c.muted, fontSize: 13, lineHeight: 19 },
  label: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  docTitle: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  action: { minHeight: 44, justifyContent: "center" },
  actionText: { color: c.brandPrimary, fontSize: 14, fontWeight: "600" },
  ok: { color: c.success, fontSize: 14, fontWeight: "600" },
}));

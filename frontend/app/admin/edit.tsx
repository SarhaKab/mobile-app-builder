import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Chips, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { VideoPlayer } from "@/src/components/video-player";
import { approveExerciseMedia, GOALS, isDraftMedia, LEVELS, listPrograms, loc, Program, removeExerciseMedia } from "@/src/home";
import { LANGS, TKey, useI18n } from "@/src/i18n";
import { supabase } from "@/src/supabase";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Formulaire d'administration d'un contenu KFIT HOME (création, modification, suppression).
type Kind = "program" | "video" | "exercise";
type FieldType = "text" | "l10n" | "l10nLong" | "int" | "minutes" | "list" | "goal" | "level" | "program" | "bool" | "levels";
type FieldDef = { key: string; label: TKey; type: FieldType };

const TABLE: Record<Kind, string> = { program: "programs", video: "videos", exercise: "exercises" };
const FORMS: Record<Kind, FieldDef[]> = {
  program: [
    { key: "slug", label: "slug", type: "text" }, { key: "title", label: "titleField", type: "l10n" },
    { key: "description", label: "descriptionField", type: "l10nLong" }, { key: "goal", label: "goal", type: "goal" },
    { key: "level", label: "level", type: "level" }, { key: "weeks", label: "weeksField", type: "int" },
    { key: "cover_path", label: "coverField", type: "text" }, { key: "is_premium", label: "premium", type: "bool" },
    { key: "is_published", label: "published", type: "bool" },
  ],
  video: [
    { key: "program_id", label: "program", type: "program" }, { key: "position", label: "position", type: "int" },
    { key: "title", label: "titleField", type: "l10n" }, { key: "description", label: "descriptionField", type: "l10nLong" },
    { key: "duration_seconds", label: "durationMin", type: "minutes" }, { key: "goal", label: "goal", type: "goal" },
    { key: "level", label: "level", type: "level" }, { key: "is_premium", label: "premium", type: "bool" },
    { key: "is_published", label: "published", type: "bool" },
  ],
  exercise: [
    { key: "slug", label: "slug", type: "text" }, { key: "name", label: "titleField", type: "l10n" },
    { key: "instructions", label: "instructions", type: "l10nLong" }, { key: "muscle_groups", label: "muscles", type: "list" },
    { key: "equipment", label: "equipment", type: "list" }, { key: "level", label: "level", type: "level" },
    { key: "level_variants", label: "byLevel", type: "levels" },
    { key: "is_published", label: "published", type: "bool" },
  ],
};

const toList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const toInt = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));

export default function AdminEdit() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind = "program", id } = useLocalSearchParams<{ kind: Kind; id?: string }>();
  const fields = FORMS[kind];
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [busy, setBusy] = useState<"save" | "delete" | "media" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "video") listPrograms(true).then(setPrograms).catch(() => {});
    if (!id) return setForm({ is_published: false, is_premium: false });
    supabase.from(TABLE[kind]).select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setErr(t("notFound")); setForm({}); return; }
      // Les champs numériques et les listes sont édités sous forme de texte.
      const f: Record<string, any> = { ...data };
      for (const d of fields) {
        if (d.type === "int") f[d.key] = data[d.key] == null ? "" : String(data[d.key]);
        if (d.type === "minutes") f[d.key] = data[d.key] == null ? "" : String(Math.round(data[d.key] / 60));
        if (d.type === "list") f[d.key] = (data[d.key] ?? []).join(", ");
      }
      setForm(f);
    });
  }, [kind, id, fields, t]);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form) return;
    const row: Record<string, any> = {};
    for (const d of fields) {
      const v = form[d.key];
      if (d.type === "int") row[d.key] = toInt(v ?? "");
      else if (d.type === "minutes") row[d.key] = toInt(v ?? "") ? toInt(v)! * 60 : null;
      else if (d.type === "list") row[d.key] = toList(v ?? "");
      else if (d.type === "l10n" || d.type === "l10nLong") row[d.key] = Object.fromEntries(LANGS.map((l) => [l, (v?.[l] ?? "").trim()]).filter(([, x]) => x));
      else if (d.type === "bool") row[d.key] = !!v;
      else if (d.type === "levels") {
        // Un niveau n'est enregistré que s'il a au moins une valeur ; séries et repos doivent être des entiers.
        row[d.key] = {};
        for (const l of LEVELS) {
          const x = v?.[l] ?? {};
          const sets = toInt(String(x.sets ?? "")), rest = toInt(String(x.rest_seconds ?? ""));
          if ([sets, rest].some((n) => n != null && (Number.isNaN(n) || n < 0))) return setErr(t("required"));
          const note = Object.fromEntries(LANGS.map((g) => [g, (x.note?.[g] ?? "").trim()]).filter(([, y]) => y));
          const reps = String(x.reps ?? "").trim() || null;
          if (sets != null || rest != null || reps || Object.keys(note).length) row[d.key][l] = { sets, reps, rest_seconds: rest, note };
        }
      }
      else if (d.type === "text") row[d.key] = (v ?? "").trim() || null;
      else row[d.key] = v ?? null;
    }
    const titleKey = kind === "exercise" ? "name" : "title";
    if (!Object.keys(row[titleKey]).length) return setErr(t("titleRequired"));
    if (kind !== "video" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug ?? "")) return setErr(t("slugInvalid"));
    if (kind === "program" && !row.level) return setErr(t("required"));
    if (kind === "video" && row.position == null) row.position = 0;
    if ([row.weeks, row.position, row.duration_seconds].some((n) => n != null && (Number.isNaN(n) || n < 0))) return setErr(t("required"));
    setBusy("save"); setErr(null);
    const q = id ? supabase.from(TABLE[kind]).update(row).eq("id", id) : supabase.from(TABLE[kind]).insert(row);
    const { error } = await q;
    setBusy(null);
    if (error) return setErr(`${t("error")} — ${error.message}`);
    router.back();
  };

  // Validation ou retrait de la vidéo de démonstration (effet immédiat, indépendant du bouton Enregistrer).
  const media = async (action: () => Promise<string | null>) => {
    setBusy("media"); setErr(null);
    try { set("media_path", await action()); } catch (e: any) { setErr(`${t("error")} — ${e?.message ?? ""}`); } finally { setBusy(null); }
  };

  const remove = async () => {
    if (!confirm) return setConfirm(true);
    setBusy("delete"); setErr(null);
    const { error } = await supabase.from(TABLE[kind]).delete().eq("id", id!);
    setBusy(null);
    if (error) return setErr(`${t("error")} — ${error.message}`);
    router.back();
  };

  if (user?.role !== "admin") {
    return (
      <View style={s.root} testID="admin-denied">
        <StackHeader title={t("admin")} />
        <Text style={s.denied}>{t("adminOnly")}</Text>
      </View>
    );
  }
  return (
    <View style={s.root} testID="admin-edit-screen">
      <StackHeader title={id ? t("editItem") : t("newItem")} />
      {!form ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          {fields.map((d) => {
            const tid = `admin-field-${d.key}`;
            if (d.type === "l10n" || d.type === "l10nLong") {
              return LANGS.map((l) => (
                <Field key={`${d.key}-${l}`} testID={`${tid}-${l}`} label={`${t(d.label)} (${l.toUpperCase()})`} multiline={d.type === "l10nLong"}
                  value={form[d.key]?.[l] ?? ""} onChangeText={(v) => set(d.key, { ...(form[d.key] ?? {}), [l]: v })} maxLength={d.type === "l10n" ? 120 : 2000} />
              ));
            }
            if (d.type === "levels") {
              const setLv = (l: string, k: string, v: any) => set(d.key, { ...(form[d.key] ?? {}), [l]: { ...(form[d.key]?.[l] ?? {}), [k]: v } });
              return LEVELS.map((l) => {
                const x = form[d.key]?.[l] ?? {};
                return (
                  <View key={l} style={s.levelBox}>
                    <Text style={s.levelTitle}>{t(l)}</Text>
                    <View style={s.levelRow}>
                      {([["sets", "sets"], ["reps", "reps"], ["rest_seconds", "restSeconds"]] as [string, TKey][]).map(([k, label]) => (
                        <View key={k} style={{ flex: 1 }}>
                          <Field testID={`${tid}-${l}-${k}`} label={t(label)} value={x[k] == null ? "" : String(x[k])} onChangeText={(v) => setLv(l, k, v)}
                            keyboardType={k === "reps" ? "default" : "number-pad"} maxLength={k === "reps" ? 20 : 3} />
                        </View>
                      ))}
                    </View>
                    {LANGS.map((g) => (
                      <Field key={g} testID={`${tid}-${l}-note-${g}`} label={`${t("levelNote")} (${g.toUpperCase()})`} value={x.note?.[g] ?? ""}
                        onChangeText={(v) => setLv(l, "note", { ...(x.note ?? {}), [g]: v })} maxLength={300} />
                    ))}
                  </View>
                );
              });
            }
            if (d.type === "bool") {
              return (
                <View key={d.key} style={s.switchRow}>
                  <Text style={s.switchLabel}>{t(d.label)}</Text>
                  <Switch testID={tid} value={!!form[d.key]} onValueChange={(v) => set(d.key, v)}
                    trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} />
                </View>
              );
            }
            if (d.type === "goal" || d.type === "level" || d.type === "program") {
              const options = d.type === "goal" ? GOALS.map((g) => ({ value: g as string, label: t(`goal_${g}` as TKey) }))
                : d.type === "level" ? LEVELS.map((l) => ({ value: l as string, label: t(l) }))
                : programs.map((p) => ({ value: p.id, label: loc(p.title, lang) || p.slug }));
              return <Chips key={d.key} testID={tid} label={t(d.label)} value={form[d.key] ?? undefined} options={options}
                onChange={(v) => set(d.key, form[d.key] === v ? null : v)} />;
            }
            return (
              <Field key={d.key} testID={tid} label={d.type === "list" ? `${t(d.label)} (${t("listHint")})` : t(d.label)}
                value={form[d.key] ?? ""} onChangeText={(v) => set(d.key, v)} autoCapitalize="none"
                keyboardType={d.type === "int" || d.type === "minutes" ? "number-pad" : "default"} maxLength={d.key === "cover_path" ? 500 : 160} />
            );
          })}
          {kind === "exercise" && !!id && (
            <View style={s.levelBox} testID="admin-media">
              <Text style={s.levelTitle}>{t("demoVideo")}</Text>
              {form.media_path ? (
                <>
                  <VideoPlayer path={form.media_path} loop />
                  <Text style={isDraftMedia(form.media_path) ? s.mediaDraft : s.mediaOk} testID="admin-media-status">
                    {t(isDraftMedia(form.media_path) ? "videoDraft" : "videoApproved")}
                  </Text>
                  {isDraftMedia(form.media_path) && (
                    <Button testID="admin-media-approve" variant="secondary" icon="checkmark" title={t("approveVideo")}
                      onPress={() => media(() => approveExerciseMedia(id, form.media_path))} loading={busy === "media"} disabled={!!busy} />
                  )}
                  <Button testID="admin-media-remove" variant="ghost" icon="trash-outline" title={t("removeVideo")}
                    onPress={() => media(() => removeExerciseMedia(id, form.media_path).then(() => null))} disabled={!!busy} />
                </>
              ) : <Text style={s.mediaNone} testID="admin-media-status">{t("videoUnavailable")}</Text>}
            </View>
          )}
          <ErrorText msg={err} />
          <Button testID="admin-save-button" title={t("save")} onPress={save} loading={busy === "save"} disabled={busy === "delete"} />
          {!!id && (
            <Button testID="admin-delete-button" variant="ghost" icon="trash-outline" title={confirm ? t("confirmDelete") : t("delete")}
              onPress={remove} loading={busy === "delete"} disabled={busy === "save"} />
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  denied: { color: c.muted, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  switchLabel: { color: c.onSurface, fontSize: 15 },
  levelBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  levelTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  levelRow: { flexDirection: "row", gap: spacing.sm },
  mediaDraft: { color: c.warning, fontSize: 13, fontWeight: "600" },
  mediaOk: { color: c.success, fontSize: 13, fontWeight: "600" },
  mediaNone: { color: c.muted, fontSize: 13 },
}));

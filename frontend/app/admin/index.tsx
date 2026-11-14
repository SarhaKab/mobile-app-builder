import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Chips, ErrorText, StackHeader } from "@/src/components/ui";
import { Exercise, listExercises, listPrograms, listVideos, loc, Program, Video } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { loadSampleContent, SAMPLE_PREFIX } from "@/src/sample-content";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type AdminKind = "program" | "video" | "exercise";

// Administration T7 CORP — gestion des contenus KFIT HOME (programmes, vidéos, exercices).
// L'accès est réservé au rôle « admin » ; la base refuse de toute façon l'écriture aux autres rôles.
export default function AdminContent() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role === "admin";
  const [kind, setKind] = useState<AdminKind>("program");
  const [data, setData] = useState<{ program: Program[]; video: Video[]; exercise: Exercise[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [program, video, exercise] = await Promise.all([listPrograms(true), listVideos(true), listExercises(true)]);
      setData({ program, video, exercise });
    } catch {
      setMsg({ ok: false, text: t("error") }); setData((d) => d ?? { program: [], video: [], exercise: [] });
    }
  }, [t]);
  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const samples = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await loadSampleContent();
      setMsg({ ok: true, text: `${t("samplesLoaded")} (${r.programs} / ${r.videos} / ${r.exercises})` });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: `${t("error")} — ${e?.message ?? ""}` });
    } finally {
      setBusy(false);
    }
  };
  const edit = (id?: string) => router.push({ pathname: "/admin/edit", params: { kind, ...(id ? { id } : {}) } } as any);

  if (!isAdmin) {
    return (
      <View style={s.root} testID="admin-denied">
        <StackHeader title={t("admin")} />
        <Text style={s.denied}>{t("adminOnly")}</Text>
      </View>
    );
  }
  return (
    <View style={s.root} testID="admin-screen">
      <StackHeader title={t("adminContent")} right={
        <Pressable testID="admin-add-button" onPress={() => edit()} style={s.iconBtn} hitSlop={8}>
          <Ionicons name="add" size={26} color={colors.brandPrimary} />
        </Pressable>} />
      <View style={s.top}>
        <Chips testID="admin-kind" value={kind} onChange={setKind}
          options={[{ value: "program", label: t("programs") }, { value: "video", label: t("videos") }, { value: "exercise", label: t("exercises") }]} />
        {msg && (msg.ok ? <Text style={s.ok} testID="admin-message">{msg.text}</Text> : <ErrorText msg={msg.text} />)}
      </View>
      {!data ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={data[kind] as (Program | Video | Exercise)[]}
          keyExtractor={(it) => it.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
          ListEmptyComponent={<Text style={s.empty} testID="admin-empty">{t("noContent")}</Text>}
          ListFooterComponent={
            <View style={s.footer}>
              <Text style={s.hint}>{t("samplesHint")}</Text>
              <Button testID="admin-load-samples" variant="secondary" icon="download-outline" title={t("loadSamples")} onPress={samples} loading={busy} />
            </View>
          }
          renderItem={({ item }: { item: any }) => (
            <Pressable testID={`admin-row-${item.id}`} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]} onPress={() => edit(item.id)}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title} numberOfLines={1}>{loc(kind === "exercise" ? item.name : item.title, lang) || "—"}</Text>
                <View style={s.badges}>
                  <Text style={[s.badge, item.is_published && s.badgeOn]}>{item.is_published ? t("published") : t("draft")}</Text>
                  {(item.slug ?? "").startsWith(SAMPLE_PREFIX) && <Text style={s.badge}>{t("sampleBadge")}</Text>}
                  {kind === "video" && <Text style={s.meta} numberOfLines={1}>{loc(item.program?.title, lang)}</Text>}
                </View>
              </View>
              <Ionicons name="create-outline" size={18} color={colors.muted} />
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
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  top: { padding: spacing.md, gap: spacing.sm },
  ok: { color: c.success, fontSize: 13, fontWeight: "600" },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  empty: { color: c.muted, textAlign: "center", marginVertical: spacing.lg },
  footer: { gap: spacing.sm, marginTop: spacing.lg },
  hint: { color: c.muted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 64, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  title: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  badges: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { color: c.onSurfaceTertiary, backgroundColor: c.surfaceTertiary, fontSize: 11, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  badgeOn: { backgroundColor: c.brandTertiary, color: c.onBrandTertiary },
  meta: { flex: 1, color: c.muted, fontSize: 12 },
}));

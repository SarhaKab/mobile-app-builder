import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, StackHeader } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ProgramDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api(`/programs/${id}`).then(setP).catch(() => {}); }, [id]);

  const enroll = async () => {
    setBusy("enroll");
    try { await api(`/programs/${id}/enroll`, { method: "POST" }); setP({ ...p, enrolled: true }); await refresh(); } finally { setBusy(null); }
  };
  const complete = async (i: number) => {
    setBusy(`w${i}`);
    try {
      const r = await api(`/programs/${id}/workouts/${i}/complete`, { method: "POST" });
      setP({ ...p, completed: r.completed });
    } finally { setBusy(null); }
  };

  return (
    <View style={s.root} testID="program-detail-screen">
      <StackHeader title={p?.title ?? ""} />
      {!p ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Image source={p.image} style={s.img} contentFit="cover" transition={300} />
          <Text style={s.meta}>{t(p.level as TKey)} · {p.weeks} {t("weeks")} · {p.completed.length}/{p.workouts.length}</Text>
          <Text style={s.desc}>{p.desc[lang]}</Text>
          {p.enrolled ? (
            <View style={s.enrolled} testID="program-enrolled-badge">
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              <Text style={s.enrolledText}>{t("enrolled")}</Text>
            </View>
          ) : <Button testID="program-enroll-button" title={t("enroll")} onPress={enroll} loading={busy === "enroll"} />}

          {p.workouts.map((w: any, i: number) => {
            const done = p.completed.includes(i);
            return (
              <View key={i} style={s.card}>
                <Pressable testID={`workout-toggle-${i}`} style={s.cardHead} onPress={() => setOpen(open === i ? null : i)}>
                  <View style={[s.num, done && s.numDone]}>
                    {done ? <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} /> : <Text style={s.numText}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.wName}>{w.name}</Text>
                    <Text style={s.wMeta}>{w.minutes} {t("minutes")} · {w.focus}</Text>
                  </View>
                  <Ionicons name={open === i ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                </Pressable>
                {open === i && (
                  <View style={s.exList}>
                    {w.exercises.map((e: any) => (
                      <View key={e.name} style={s.ex}>
                        <Text style={s.exName}>{e.name}</Text>
                        <Text style={s.exMeta}>{e.sets} {t("sets")} × {e.reps}</Text>
                      </View>
                    ))}
                    {done ? <Text style={s.doneText} testID={`workout-done-${i}`}>✓ {t("completed")}</Text> : (
                      <Button testID={`workout-complete-${i}`} variant="secondary" icon="checkmark" title={t("markDone")}
                        onPress={() => complete(i)} loading={busy === `w${i}`} disabled={!p.enrolled} />
                    )}
                  </View>
                )}
              </View>
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
  img: { height: 200, borderRadius: radius.lg },
  meta: { color: c.brandPrimary, fontSize: 13, fontWeight: "600" },
  desc: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  enrolled: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  enrolledText: { color: c.onBrandTertiary, fontWeight: "600" },
  card: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 64 },
  num: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  numDone: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  numText: { color: c.onSurface, fontWeight: "600" },
  wName: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
  wMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  exList: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  ex: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.divider },
  exName: { color: c.onSurfaceSecondary, fontSize: 14 },
  exMeta: { color: c.muted, fontSize: 13 },
  doneText: { color: c.success, fontWeight: "600", textAlign: "center", paddingVertical: spacing.sm },
}));

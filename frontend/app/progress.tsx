import Ionicons from "@react-native-vector-icons/ionicons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, ErrorText, Field, SectionTitle, StackHeader } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Entry = { id: string; date: string; weight: number; body_fat?: number; note?: string };

export default function Progress() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api<Entry[]>("/progress").then(setEntries).catch(() => {}); }, []);

  const save = async () => {
    const w = parseFloat(weight.replace(",", ".")), bf = fat ? parseFloat(fat.replace(",", ".")) : undefined;
    if (!(w > 20 && w < 400) || (bf !== undefined && !(bf >= 2 && bf <= 70))) return setErr(t("required"));
    setErr(null); setLoading(true);
    try {
      const e = await api<Entry>("/progress", { method: "POST", body: { weight: w, body_fat: bf, note: note.trim() || undefined } });
      setEntries((x) => [e, ...x]); setWeight(""); setFat(""); setNote("");
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  const del = async (id: string) => { await api(`/progress/${id}`, { method: "DELETE" }).catch(() => {}); setEntries((x) => x.filter((e) => e.id !== id)); };

  const chart = [...entries].slice(0, 10).reverse();
  const min = Math.min(...chart.map((e) => e.weight)), max = Math.max(...chart.map((e) => e.weight));
  const delta = entries.length > 1 ? +(entries[0].weight - entries[entries.length - 1].weight).toFixed(1) : 0;

  return (
    <View style={s.root} testID="progress-screen">
      <StackHeader title={t("progressTitle")} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        {chart.length > 0 && (
          <View style={s.card} testID="progress-chart">
            <View style={s.chartHead}>
              <Text style={s.big}>{entries[0].weight} {t("kg")}</Text>
              <Text style={[s.delta, { color: delta <= 0 ? colors.success : colors.warning }]}>{t("change")}: {delta > 0 ? "+" : ""}{delta} {t("kg")}</Text>
            </View>
            <View style={s.chart}>
              {chart.map((e) => (
                <View key={e.id} style={s.barWrap}>
                  <View style={[s.bar, { height: 24 + (max === min ? 40 : ((e.weight - min) / (max - min)) * 80) }]} />
                  <Text style={s.barLabel}>{e.weight}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <SectionTitle>{t("logWeight")}</SectionTitle>
        <Field testID="progress-weight-input" label={t("weight")} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} />
        <Field testID="progress-bodyfat-input" label={t("bodyFat")} value={fat} onChangeText={setFat} keyboardType="decimal-pad" maxLength={4} />
        <Field testID="progress-note-input" label={t("note")} value={note} onChangeText={setNote} maxLength={200} />
        <ErrorText msg={err} />
        <Button testID="progress-save-button" title={t("save")} onPress={save} loading={loading} />
        <SectionTitle>{t("history")}</SectionTitle>
        {entries.length === 0 ? <Text style={s.muted} testID="progress-empty">{t("noEntries")}</Text> : entries.map((e) => (
          <View key={e.id} style={s.entry} testID="progress-entry">
            <View style={{ flex: 1 }}>
              <Text style={s.entryW}>{e.weight} {t("kg")}{e.body_fat ? ` · ${e.body_fat}%` : ""}</Text>
              <Text style={s.muted}>{new Date(e.date).toLocaleDateString()}{e.note ? ` · ${e.note}` : ""}</Text>
            </View>
            <Pressable testID={`progress-delete-${e.id}`} onPress={() => del(e.id)} style={s.del} hitSlop={6}>
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, gap: spacing.md },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  big: { color: c.onSurface, fontSize: 28, fontWeight: "700" },
  delta: { fontSize: 13, fontWeight: "600" },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 130, gap: 6, overflow: "hidden" },
  barWrap: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "70%", borderRadius: 6, backgroundColor: c.brandPrimary },
  barLabel: { color: c.muted, fontSize: 9 },
  muted: { color: c.muted, fontSize: 13 },
  entry: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  entryW: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
  del: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

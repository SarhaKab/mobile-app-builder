import Ionicons from "@react-native-vector-icons/ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Chips, ErrorText, Field, SectionTitle, StackHeader } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Form = { goal: string; sex: string; age: string; weight: string; height: string; activity: string; diet: string };

export default function Nutrition() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<any>(undefined);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Form>({ goal: user?.goal ?? "muscle", sex: "male", age: "", weight: "", height: "", activity: "moderate", diet: "omnivore" });
  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const opts = (keys: string[]) => keys.map((k) => ({ value: k, label: t(k as TKey) }));

  useEffect(() => {
    api("/nutrition/plan").then((r) => {
      setPlan(r.plan);
      if (r.input) setF(Object.fromEntries(Object.entries(r.input).map(([k, v]) => [k, String(v)])) as Form);
    }).catch(() => setPlan(null));
  }, []);

  const generate = async () => {
    const age = parseInt(f.age, 10), weight = parseFloat(f.weight), height = parseFloat(f.height);
    if (!(age > 12 && age < 100 && weight > 20 && weight < 400 && height > 100 && height < 250)) return setErr(t("required"));
    setErr(null); setLoading(true);
    try {
      const r = await api("/nutrition/plan", { method: "POST", body: { ...f, age, weight, height } });
      setPlan(r.plan); setEditing(false);
    } catch (e: any) { setErr(e.message || t("error")); } finally { setLoading(false); }
  };

  const showForm = plan === null || editing;

  return (
    <View style={s.root} testID="nutrition-screen">
      <StackHeader title={t("nutritionTitle")} />
      {plan === undefined ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          {showForm ? (
            <>
              <Chips testID="nutrition-goal" label={t("goal")} value={f.goal} onChange={set("goal")} options={opts(["muscle", "fat_loss", "balance", "endurance"])} />
              <Chips testID="nutrition-sex" label={t("sex")} value={f.sex} onChange={set("sex")} options={opts(["male", "female"])} />
              <View style={s.row}>
                <View style={{ flex: 1 }}><Field testID="nutrition-age-input" label={t("age")} value={f.age} onChangeText={set("age")} keyboardType="number-pad" maxLength={2} /></View>
                <View style={{ flex: 1 }}><Field testID="nutrition-weight-input" label={t("weight")} value={f.weight} onChangeText={set("weight")} keyboardType="decimal-pad" maxLength={5} /></View>
                <View style={{ flex: 1 }}><Field testID="nutrition-height-input" label={t("height")} value={f.height} onChangeText={set("height")} keyboardType="number-pad" maxLength={3} /></View>
              </View>
              <Chips testID="nutrition-activity" label={t("activity")} value={f.activity} onChange={set("activity")} options={opts(["low", "moderate", "high"])} />
              <Chips testID="nutrition-diet" label={t("diet")} value={f.diet} onChange={set("diet")} options={opts(["omnivore", "vegetarian", "vegan"])} />
              <ErrorText msg={err} />
              <Button testID="nutrition-generate-button" icon="sparkles" title={loading ? t("generating") : t("generate")} onPress={generate} loading={loading} />
              {loading && <Text style={s.muted}>{t("generating")}</Text>}
            </>
          ) : (
            <>
              <View style={s.hero} testID="nutrition-plan-result">
                <Ionicons name="sparkles" size={20} color={colors.brandPrimary} />
                <Text style={s.kcal} testID="nutrition-calories">{plan.calories}</Text>
                <Text style={s.muted}>{t("kcal")} {t("perDay")}</Text>
                <Text style={s.summary}>{plan.summary}</Text>
              </View>
              <View style={s.row}>
                {([["protein", plan.protein], ["carbs", plan.carbs], ["fats", plan.fats]] as const).map(([k, v]) => (
                  <View key={k} style={s.macro}><Text style={s.macroVal}>{v} g</Text><Text style={s.muted}>{t(k)}</Text></View>
                ))}
              </View>
              <SectionTitle>{t("meals")}</SectionTitle>
              {plan.meals?.map((m: any, i: number) => (
                <View key={i} style={s.card}>
                  <View style={s.mealHead}><Text style={s.mealName}>{m.name}</Text><Text style={s.muted}>{m.time} · {m.calories} {t("kcal")}</Text></View>
                  {m.items?.map((it: string, j: number) => <Text key={j} style={s.item}>• {it}</Text>)}
                </View>
              ))}
              <SectionTitle>{t("tips")}</SectionTitle>
              {plan.tips?.map((tip: string, i: number) => (
                <View key={i} style={s.tip}><Ionicons name="checkmark" size={16} color={colors.brandPrimary} /><Text style={s.item}>{tip}</Text></View>
              ))}
              <Button testID="nutrition-adjust-button" icon="options-outline" title={t("adjust")} onPress={() => setEditing(true)} />
            </>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm },
  muted: { color: c.muted, fontSize: 13 },
  hero: { alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 4 },
  kcal: { color: c.onSurface, fontSize: 44, fontWeight: "700" },
  summary: { color: c.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: spacing.sm },
  macro: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center" },
  macroVal: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  card: { padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, gap: 6 },
  mealHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  mealName: { color: c.onSurface, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  item: { color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 20, flex: 1 },
  tip: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
}));

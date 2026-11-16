import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Chips, ErrorText, Field, SectionTitle, StackHeader } from "@/src/components/ui";
import { addSlot, hhmm, listSlots, removeSlot, Slot } from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Disponibilités déclarées librement par le coach : aucun volume minimum, modifiables à tout moment.
const DAYS = ["1", "2", "3", "4", "5", "6", "0"] as const; // lundi → dimanche (0 = dimanche en base)
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function ProAvailability() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<(typeof DAYS)[number]>("1");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try { setSlots(await listSlots(user.user_id)); } catch { setErr(t("error")); setSlots((v) => v ?? []); }
  }, [user, t]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!user) return;
    setErr(null);
    if (!TIME.test(from) || !TIME.test(to) || to <= from) return setErr(t("proTimeInvalid"));
    setBusy(true);
    try { await addSlot(user.user_id, Number(day), from, to); await load(); } catch { setErr(t("error")); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setErr(null);
    try { await removeSlot(id); await load(); } catch { setErr(t("error")); }
  };

  return (
    <View style={s.root} testID="pro-availability-screen">
      <StackHeader title={t("proStepAvailability")} />
      {!slots ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={s.hint}>{t("proAvailabilityHint")}</Text>

          {slots.length === 0 ? <Text style={s.empty} testID="pro-no-slots">{t("proNoSlots")}</Text> : (
            <View style={s.group}>
              {slots.map((slot, i) => (
                <View key={slot.id} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]} testID={`pro-slot-${slot.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowText}>{t(`day_${slot.weekday}` as TKey)}</Text>
                    <Text style={s.rowSub}>{hhmm(slot.start_time)} – {hhmm(slot.end_time)}</Text>
                  </View>
                  <Pressable testID={`pro-slot-remove-${slot.id}`} onPress={() => remove(slot.id)} style={s.iconBtn} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <SectionTitle>{t("proAddSlot")}</SectionTitle>
          <Chips testID="pro-slot-day" value={day} onChange={setDay} options={DAYS.map((d) => ({ value: d, label: t(`day_${d}` as TKey) }))} />
          <View style={s.times}>
            <View style={{ flex: 1 }}><Field testID="pro-slot-from" label={t("proFrom")} value={from} onChangeText={setFrom} maxLength={5} keyboardType="numbers-and-punctuation" /></View>
            <View style={{ flex: 1 }}><Field testID="pro-slot-to" label={t("proTo")} value={to} onChangeText={setTo} maxLength={5} keyboardType="numbers-and-punctuation" /></View>
          </View>
          <ErrorText msg={err} />
          <Button testID="pro-slot-add" title={t("proAddSlot")} icon="add" onPress={add} loading={busy} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  empty: { color: c.muted, textAlign: "center", marginVertical: spacing.md },
  group: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.md, minHeight: 60 },
  rowText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  rowSub: { color: c.muted, fontSize: 13, marginTop: 2 },
  iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  times: { flexDirection: "row", gap: spacing.md },
}));

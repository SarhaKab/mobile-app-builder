import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, ErrorText, IconName, SectionTitle, StackHeader } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TYPES: [string, IconName][] = [["gym", "barbell-outline"], ["outdoor", "sunny-outline"], ["online", "videocam-outline"]];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Booking() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const [type, setType] = useState("gym");
  const [date, setDate] = useState(iso(days[0]));
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[] | null>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadSlots = useCallback(() => { setSlots(null); api(`/coaching/slots?date=${date}`).then(setSlots).catch(() => setSlots([])); }, [date]);
  useEffect(() => { loadSlots(); setTime(null); }, [loadSlots]);
  useEffect(() => { api("/bookings").then(setMine).catch(() => {}); }, []);

  const confirm = async () => {
    if (!time) return;
    setErr(null); setMsg(null); setLoading(true);
    try {
      const b = await api("/bookings", { method: "POST", body: { type, date, time } });
      setMine((x) => [...x, b].sort((a, c) => (a.date + a.time).localeCompare(c.date + c.time)));
      setMsg(t("booked")); setTime(null); loadSlots();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  const cancel = async (id: string) => {
    await api(`/bookings/${id}`, { method: "DELETE" }).catch(() => {});
    setMine((x) => x.filter((b) => b.id !== id)); loadSlots();
  };

  return (
    <View style={s.root} testID="booking-screen">
      <StackHeader title={t("bookingTitle")} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <SectionTitle>{t("sessionType")}</SectionTitle>
        {TYPES.map(([k, icon]) => (
          <Pressable key={k} testID={`booking-type-${k}`} onPress={() => setType(k)} style={[s.type, type === k && s.typeOn]}>
            <Ionicons name={icon} size={22} color={type === k ? colors.brandPrimary : colors.onSurfaceTertiary} />
            <Text style={s.typeText}>{t(k as TKey)}</Text>
            <Ionicons name={type === k ? "radio-button-on" : "radio-button-off"} size={20} color={type === k ? colors.brandPrimary : colors.muted} />
          </Pressable>
        ))}
        <SectionTitle>{t("pickDate")}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {days.map((d) => {
            const v = iso(d), on = v === date;
            return (
              <Pressable key={v} testID={`booking-date-${v}`} onPress={() => setDate(v)} style={[s.day, on && s.dayOn]}>
                <Text style={[s.dayW, on && s.onText]}>{d.toLocaleDateString(lang, { weekday: "short" })}</Text>
                <Text style={[s.dayN, on && s.onText]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <SectionTitle>{t("pickTime")}</SectionTitle>
        {!slots ? <ActivityIndicator color={colors.brandPrimary} /> : (
          <View style={s.grid}>
            {slots.map((sl) => (
              <Pressable key={sl.time} testID={`booking-slot-${sl.time}`} disabled={!sl.available} onPress={() => setTime(sl.time)}
                style={[s.slot, time === sl.time && s.dayOn, !sl.available && { opacity: 0.3 }]}>
                <Text style={[s.slotText, time === sl.time && s.onText]}>{sl.time}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <ErrorText msg={err} />
        {msg && <Text style={s.success} testID="booking-success">{msg}</Text>}
        <Button testID="booking-confirm-button" title={t("confirm")} onPress={confirm} loading={loading} disabled={!time} />
        <SectionTitle>{t("myBookings")}</SectionTitle>
        {mine.length === 0 ? <Text style={s.muted}>{t("none")}</Text> : mine.map((b) => (
          <View key={b.id} style={s.booking} testID="booking-item">
            <View style={{ flex: 1 }}>
              <Text style={s.bTitle}>{b.date} · {b.time}</Text>
              <Text style={s.muted}>{t(b.type as TKey)} · {t("with")} {b.coach}</Text>
            </View>
            <Pressable testID={`booking-cancel-${b.id}`} onPress={() => cancel(b.id)} style={s.cancel}>
              <Text style={s.cancelText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  type: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 60, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  typeOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  typeText: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "500" },
  day: { width: 56, height: 68, flexShrink: 0, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 2 },
  dayOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayW: { color: c.muted, fontSize: 11, textTransform: "capitalize" },
  dayN: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  onText: { color: c.onBrandPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: { width: "31%", height: 48, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  slotText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  success: { color: c.success, fontWeight: "600" },
  muted: { color: c.muted, fontSize: 13 },
  booking: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  bTitle: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  cancel: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: "center" },
  cancelText: { color: c.error, fontWeight: "600" },
}));

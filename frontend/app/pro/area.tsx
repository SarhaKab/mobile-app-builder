import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { getServiceArea, ServiceArea, setServiceArea } from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Zone d'intervention : un centre et un rayon.
// Géolocalisation proportionnée : la position n'est lue qu'une fois, à la demande du coach,
// pour fixer le centre de sa zone. Elle n'est jamais suivie en continu.
export default function ProArea() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<ServiceArea | null | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"gps" | "address" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const a = await getServiceArea(user.user_id);
      setArea(a);
      if (a) { setLabel(a.label ?? ""); setRadiusKm(String(a.radius_km)); }
    } catch {
      setArea(null); setMsg({ ok: false, text: t("error") });
    }
  }, [user, t]);
  useEffect(() => { load(); }, [load]);

  const save = async (mode: "gps" | "address") => {
    const km = parseFloat(radiusKm.replace(",", "."));
    if (!Number.isFinite(km) || km < 1 || km > 100) return setMsg({ ok: false, text: t("proRadiusInvalid") });
    setBusy(mode); setMsg(null);
    const fail = (k: TKey) => setMsg({ ok: false, text: t(k) });
    try {
      let lat: number, lng: number;
      if (mode === "gps") {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") return fail("proLocationDenied");
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else {
        if (address.trim().length < 4) return fail("proAddressNotFound");
        const found = await Location.geocodeAsync(address.trim()).catch(() => []);
        if (!found.length) return fail("proAddressNotFound");
        lat = found[0].latitude; lng = found[0].longitude;
      }
      await setServiceArea(lat, lng, km, label.trim() || (mode === "address" ? address.trim().slice(0, 120) : null));
      await load();
      setMsg({ ok: true, text: t("proAreaSaved") });
    } catch {
      fail("error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.root} testID="pro-area-screen">
      <StackHeader title={t("proStepArea")} />
      {area === undefined ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={s.hint}>{t("proAreaHint")}</Text>
          <View style={s.card} testID="pro-area-current">
            <Text style={s.label}>{t("proAreaCurrent")}</Text>
            <Text style={s.value}>{area ? `${area.label || "—"} · ${area.radius_km} km` : t("proAreaNone")}</Text>
          </View>
          <Field testID="pro-area-label" label={t("proAreaLabel")} value={label} onChangeText={setLabel} maxLength={120} />
          <Field testID="pro-area-radius" label={t("proRadius")} value={radiusKm} onChangeText={setRadiusKm} keyboardType="decimal-pad" maxLength={5} />
          <Button testID="pro-area-gps" icon="navigate-outline" title={t("proUseLocation")} onPress={() => save("gps")} loading={busy === "gps"} disabled={busy !== null} />
          <Field testID="pro-area-address" label={t("proAddress")} value={address} onChangeText={setAddress} maxLength={200} autoComplete="street-address" />
          <Button testID="pro-area-search" variant="secondary" icon="search-outline" title={t("proSearchAddress")} onPress={() => save("address")}
            loading={busy === "address"} disabled={busy !== null} />
          {msg && (msg.ok ? <Text style={s.ok} testID="pro-area-saved">{msg.text}</Text> : <ErrorText msg={msg.text} />)}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  card: { gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  label: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  value: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
  ok: { color: c.success, fontSize: 14, fontWeight: "600" },
}));

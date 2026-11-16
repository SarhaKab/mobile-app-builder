import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { formatMoney, getCoach, listMarkets, Market, saveCoach, SPECIALTIES } from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Profil public du coach et tarif horaire.
// Le coach fixe librement son tarif dans la limite du marché ; la base refuse tout dépassement.
export default function ProProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [experience, setExperience] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [c, markets] = await Promise.all([getCoach(user.user_id), listMarkets()]);
        if (!c) return router.replace("/pro" as any);
        setMarket(markets.find((m) => m.code === c.market_code) ?? null);
        setName(c.display_name); setHeadline(c.headline ?? ""); setBio(c.bio ?? ""); setSpecialties(c.specialties);
        setYears(c.experience_years != null ? String(c.experience_years) : ""); setExperience(c.experience_summary ?? "");
        setRate(c.hourly_rate_cents != null ? (c.hourly_rate_cents / 100).toFixed(2) : "");
        setReady(true);
      } catch {
        setErr(t("error")); setReady(true);
      }
    })();
  }, [user, router, t]);

  const toggle = (v: string) => setSpecialties((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]));

  const save = async () => {
    if (!user) return;
    setErr(null);
    const cents = Math.round(parseFloat(rate.replace(",", ".")) * 100);
    const y = years.trim() === "" ? null : parseInt(years, 10);
    if (!name.trim()) return setErr(t("required"));
    if (bio.trim().length < 40) return setErr(t("proBioShort"));
    if (!specialties.length) return setErr(t("proPickSpecialty"));
    if (y != null && (!Number.isFinite(y) || y < 0 || y > 70)) return setErr(t("required"));
    if (!Number.isFinite(cents) || cents <= 0 || (market && cents > market.max_hourly_rate_cents)
      || (market?.min_hourly_rate_cents != null && cents < market.min_hourly_rate_cents)) return setErr(t("proRateInvalid"));
    setSaving(true);
    try {
      await saveCoach(user.user_id, {
        display_name: name.trim(), headline: headline.trim() || null, bio: bio.trim(), specialties,
        experience_years: y, experience_summary: experience.trim() || null, hourly_rate_cents: cents,
      });
      router.back();
    } catch (e: any) {
      setErr(/hourly rate/.test(e?.message ?? "") ? t("proRateInvalid") : t("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root} testID="pro-profile-screen">
      <StackHeader title={t("proStepProfile")} />
      {!ready ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Field testID="pro-name-input" label={t("proDisplayName")} value={name} onChangeText={setName} maxLength={80} />
          <Field testID="pro-headline-input" label={t("proHeadline")} value={headline} onChangeText={setHeadline} maxLength={140} />
          <Field testID="pro-bio-input" label={t("proBio")} value={bio} onChangeText={setBio} multiline maxLength={2000} />
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{t("proSpecialties")}</Text>
            <View style={s.wrap}>
              {SPECIALTIES.map((v) => {
                const on = specialties.includes(v);
                return (
                  <Pressable key={v} testID={`pro-specialty-${v}`} onPress={() => toggle(v)} style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{t(`sp_${v}` as TKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field testID="pro-years-input" label={t("proYears")} value={years} onChangeText={setYears} keyboardType="number-pad" maxLength={2} />
          <Field testID="pro-experience-input" label={t("proExperience")} value={experience} onChangeText={setExperience} multiline maxLength={2000} />
          <Field testID="pro-rate-input" label={`${t("proRate")}${market ? ` (${market.currency})` : ""}`} value={rate} onChangeText={setRate}
            keyboardType="decimal-pad" maxLength={8} />
          {market && (
            <Text style={s.hint} testID="pro-rate-max">
              {t("proRateMax")} : {formatMoney(market.max_hourly_rate_cents, market.currency)} {t("perHour")}. {t("proRateNote")}
            </Text>
          )}
          <ErrorText msg={err} />
          <Button testID="pro-profile-save" title={t("save")} onPress={save} loading={saving} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "500", letterSpacing: 0.4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceSecondary, fontSize: 14, fontWeight: "500" },
  chipTextOn: { color: c.onBrandPrimary },
  hint: { color: c.muted, fontSize: 12, lineHeight: 18 },
}));

import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { supabase } from "@/src/supabase";
import { makeStyles, spacing, useTheme } from "@/src/theme";

// Coordonnées de l'utilisateur : nom, téléphone, adresse postale.
// Elles sont enregistrées dans son profil Supabase (client_profiles.preferences.contact),
// lisible uniquement par lui-même et par l'équipe KFIT (règles RLS).
const FIELDS = ["phone", "address1", "address2", "postalCode", "city", "region", "country"] as const;
type ContactKey = (typeof FIELDS)[number];
type Contact = Record<ContactKey, string>;
const EMPTY: Contact = { phone: "", address1: "", address2: "", postalCode: "", city: "", region: "", country: "" };
const MAX: Record<ContactKey, number> = { phone: 20, address1: 120, address2: 120, postalCode: 12, city: 80, region: 80, country: 60 };

export default function ContactDetails() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user?.name ?? "");
  const [contact, setContact] = useState<Contact>(EMPTY);
  const [prefs, setPrefs] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("client_profiles").select("preferences").eq("user_id", user.user_id).maybeSingle().then(({ data, error }) => {
      if (error) return setMsg({ ok: false, text: t("error") });
      const p = (data?.preferences ?? {}) as Record<string, any>;
      setPrefs(p);
      setContact({ ...EMPTY, ...(p.contact ?? {}) });
    });
  }, [user, t]);

  const save = async () => {
    if (!user || !prefs) return;
    const clean = Object.fromEntries(FIELDS.map((k) => [k, contact[k].trim()])) as Contact;
    if (!name.trim()) return setMsg({ ok: false, text: t("required") });
    if (clean.phone && !/^\+?[0-9 ().-]{6,20}$/.test(clean.phone)) return setMsg({ ok: false, text: t("phoneInvalid") });
    setSaving(true); setMsg(null);
    try {
      const next = { ...prefs, contact: clean };
      const { error } = await supabase.from("client_profiles").upsert({ user_id: user.user_id, preferences: next });
      if (error) throw new Error(error.message);
      if (name.trim() !== user.name) await updateProfile({ name: name.trim() });
      setPrefs(next); setContact(clean);
      setMsg({ ok: true, text: t("saved") });
    } catch {
      setMsg({ ok: false, text: t("error") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root} testID="contact-screen">
      <StackHeader title={t("contactTitle")} />
      {!prefs && !msg ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Field testID="contact-name-input" label={t("fullName")} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          {FIELDS.map((k) => (
            <Field key={k} testID={`contact-${k}-input`} label={t(k as TKey)} value={contact[k]} maxLength={MAX[k]}
              onChangeText={(v) => setContact({ ...contact, [k]: v })}
              keyboardType={k === "phone" ? "phone-pad" : "default"}
              autoComplete={k === "phone" ? "tel" : k === "postalCode" ? "postal-code" : k === "address1" ? "street-address" : "off"} />
          ))}
          <Text style={s.hint}>{t("contactPrivacy")}</Text>
          {msg && (msg.ok ? <Text style={s.ok} testID="contact-saved">{msg.text}</Text> : <ErrorText msg={msg.text} />)}
          <Button testID="contact-save-button" title={t("save")} onPress={save} loading={saving} disabled={!prefs} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { color: c.muted, fontSize: 12, lineHeight: 18 },
  ok: { color: c.success, fontSize: 14, fontWeight: "600" },
}));

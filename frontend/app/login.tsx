import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthError, useAuth } from "@/src/auth";
import { Button, Emblem, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, spacing, useTheme } from "@/src/theme";

// Connexion Google / Apple : non proposée tant que les fournisseurs ne sont pas
// configurés dans Supabase (voir docs/AUTH.md). Aucun bouton factice.
export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { login, register } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [isRegister, setIsRegister] = useState(params.mode === "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const mail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail) || password.length < (isRegister ? 8 : 1) || (isRegister && !name.trim())) {
      return setErr(t("required"));
    }
    setLoading(true);
    try {
      if (isRegister) {
        const result = await register(name.trim(), mail, password);
        if (result === "confirm_email") {
          setSentTo(mail);
          setPassword("");
        }
      } else {
        await login(mail, password);
      }
    } catch (e: any) {
      setErr(e instanceof AuthError ? t(`authErr_${e.code}` as TKey) : t("authErr_unknown"));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <View style={s.root} testID="login-confirm-email">
        <StackHeader title={t("register")} />
        <View style={[s.content, s.center, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Ionicons name="mail-unread-outline" size={56} color={colors.brandPrimary} />
          <Text style={[s.title, s.centerText]}>{t("checkEmailTitle")}</Text>
          <Text style={s.body}>{t("checkEmailBody")}</Text>
          <Text style={s.mail} testID="login-confirm-email-address">{sentTo}</Text>
          <Text style={s.body}>{t("checkEmailHint")}</Text>
          <Button testID="login-back-to-login" title={t("backToLogin")}
            onPress={() => { setSentTo(null); setIsRegister(false); setErr(null); }} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root} testID="login-screen">
      <StackHeader title={isRegister ? t("register") : t("login")} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Emblem size={56} />
        <Text style={s.title}>{isRegister ? t("register") : t("login")}</Text>
        <Text style={s.sub}>{t("tagline")}</Text>
        {isRegister && <Field testID="login-name-input" label={t("name")} value={name} onChangeText={setName} autoComplete="name" maxLength={60} />}
        <Field testID="login-email-input" label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field testID="login-password-input" label={t("password")} value={password} onChangeText={setPassword} secureTextEntry
          autoComplete={isRegister ? "new-password" : "current-password"} placeholder={isRegister ? t("pwHint") : undefined} onSubmitEditing={submit} />
        <ErrorText msg={err} />
        <Button testID="login-submit-button" title={isRegister ? t("register") : t("login")} onPress={submit} loading={loading} />
        <Pressable testID="login-toggle-mode" onPress={() => { setIsRegister(!isRegister); setErr(null); }} style={s.toggle}>
          <Text style={s.toggleText}>{isRegister ? t("gotAccount") : t("noAccount")}</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { textAlign: "center" },
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700", marginTop: spacing.sm },
  sub: { color: c.muted, fontSize: 11, letterSpacing: 3, marginBottom: spacing.sm },
  body: { color: c.onSurfaceSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  mail: { color: c.onSurface, fontSize: 16, fontWeight: "600", textAlign: "center" },
  toggle: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  toggleText: { color: c.brandPrimary, fontSize: 15, fontWeight: "500" },
}));

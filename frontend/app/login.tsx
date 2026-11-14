import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Emblem, ErrorText, Field, StackHeader } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { makeStyles, spacing } from "@/src/theme";

export default function Login() {
  const s = useStyles();
  const { t } = useI18n();
  const { login, register, loginGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [isRegister, setIsRegister] = useState(params.mode === "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < (isRegister ? 8 : 1) || (isRegister && !name.trim())) {
      return setErr(t("required"));
    }
    setLoading(true);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (e: any) {
      setErr(e.message || t("error"));
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setErr(null);
    setGLoading(true);
    try { await loginGoogle(); } catch (e: any) { setErr(e.message || t("error")); } finally { setGLoading(false); }
  };

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
        <View style={s.orRow}><View style={s.line} /><Text style={s.or}>{t("or")}</Text><View style={s.line} /></View>
        <Button testID="login-google-button" variant="secondary" icon="logo-google" title={t("google")} onPress={google} loading={gLoading} />
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
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700", marginTop: spacing.sm },
  sub: { color: c.muted, fontSize: 11, letterSpacing: 3, marginBottom: spacing.sm },
  orRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, height: 1, backgroundColor: c.divider },
  or: { color: c.muted, fontSize: 13 },
  toggle: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  toggleText: { color: c.brandPrimary, fontSize: 15, fontWeight: "500" },
}));

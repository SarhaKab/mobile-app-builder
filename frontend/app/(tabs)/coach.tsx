import Ionicons from "@react-native-vector-icons/ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, streamChat } from "@/src/api";
import { Emblem, ErrorText } from "@/src/components/ui";
import { TKey, useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export default function Coach() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => { api<Msg[]>("/coach/messages").then(setMsgs).catch(() => {}); }, []);

  const send = async (raw?: string) => {
    const m = (raw ?? text).trim();
    if (!m || busy) return;
    setText(""); setErr(null); setBusy(true);
    const aid = `a${Date.now()}`;
    setMsgs((x) => [...x, { id: `u${Date.now()}`, role: "user", content: m }, { id: aid, role: "assistant", content: "" }]);
    try {
      await streamChat(m, (d) => setMsgs((x) => x.map((y) => (y.id === aid ? { ...y, content: y.content + d } : y))));
    } catch {
      setErr(t("error"));
      setMsgs((x) => x.filter((y) => y.id !== aid || y.content));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => { await api("/coach/messages", { method: "DELETE" }).catch(() => {}); setMsgs([]); };
  const suggestions: TKey[] = ["s1", "s2", "s3", "s4"];

  return (
    <View style={s.root} testID="coach-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Emblem size={28} />
        <Text style={s.title}>{t("coachTitle")}</Text>
        <Pressable testID="coach-clear-button" onPress={clear} style={s.clearBtn} hitSlop={6}>
          <Ionicons name="trash-outline" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={s.empty} testID="coach-empty">
              <View style={s.spark}><Ionicons name="sparkles" size={28} color={colors.onBrandPrimary} /></View>
              <Text style={s.intro}>{t("coachIntro")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View testID={`coach-msg-${item.role}`} style={[s.bubble, item.role === "user" ? s.user : s.ai]}>
              {item.content ? <Text style={item.role === "user" ? s.userText : s.aiText}>{item.content}</Text>
                : <ActivityIndicator color={colors.brandPrimary} size="small" />}
            </View>
          )}
        />
        {msgs.length === 0 && (
          <View style={{ height: 56, justifyContent: "center" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sugRow}>
              {suggestions.map((k) => (
                <Pressable key={k} testID={`coach-suggestion-${k}`} style={s.sug} onPress={() => send(t(k))}>
                  <Text style={s.sugText}>{t(k)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        {err && <View style={{ paddingHorizontal: spacing.md }}><ErrorText msg={err} /></View>}
        <View style={[s.inputRow, { paddingBottom: bottomChrome + spacing.sm }]}>
          <TextInput testID="coach-input" value={text} onChangeText={setText} placeholder={t("typeMessage")} placeholderTextColor={colors.muted}
            style={s.input} multiline maxLength={2000} />
          <Pressable testID="coach-send-button" onPress={() => send()} disabled={busy || !text.trim()} style={[s.send, (busy || !text.trim()) && { opacity: 0.4 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { flex: 1, color: c.onSurface, fontSize: 20, fontWeight: "700" },
  clearBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  spark: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  intro: { color: c.onSurfaceSecondary, fontSize: 16, textAlign: "center", lineHeight: 22 },
  bubble: { maxWidth: "86%", padding: 12, borderRadius: radius.md },
  user: { alignSelf: "flex-end", backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  ai: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  userText: { color: c.onBrandPrimary, fontSize: 15, lineHeight: 21 },
  aiText: { color: c.onSurface, fontSize: 15, lineHeight: 22 },
  sugRow: { gap: spacing.sm, paddingHorizontal: spacing.md },
  sug: { height: 36, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.borderStrong, justifyContent: "center" },
  sugText: { color: c.onSurfaceSecondary, fontSize: 13 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: c.surfaceSecondary, borderRadius: 22, paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 12, color: c.onSurface, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));

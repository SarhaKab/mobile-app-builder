import Ionicons from "@react-native-vector-icons/ionicons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { ErrorText, StackHeader } from "@/src/components/ui";
import { CoachDocument, DOC_TYPES, DocType, listDocuments, removeDocument, REQUIRED_DOCS, signedDocumentUrl, uploadDocument } from "@/src/coach";
import { TKey, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

// Justificatifs professionnels du coach, déposés dans un espace de stockage privé.
// La vérification est faite par une personne de l'équipe KFIT : aucun contrôle automatique n'est simulé.
const MAX_BYTES = 10 * 1024 * 1024;

export default function ProDocuments() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<CoachDocument[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try { setDocs(await listDocuments(user.user_id)); } catch { setErr(t("error")); setDocs((d) => d ?? []); }
  }, [user, t]);
  useEffect(() => { load(); }, [load]);

  const add = async (type: DocType) => {
    if (!user) return;
    setErr(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    if (file.size != null && file.size > MAX_BYTES) return setErr(t("proUploadFailed"));
    setBusy(type);
    try {
      await uploadDocument(user.user_id, type, { uri: file.uri, name: file.name, mimeType: file.mimeType });
      await load();
    } catch {
      setErr(t("proUploadFailed"));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (doc: CoachDocument) => {
    setErr(null); setBusy(doc.id);
    try { await removeDocument(doc); await load(); } catch { setErr(t("error")); } finally { setBusy(null); }
  };
  const open = async (doc: CoachDocument) => {
    setErr(null);
    try { await Linking.openURL(await signedDocumentUrl(doc.storage_path)); } catch { setErr(t("error")); }
  };

  const stateColor = (st: CoachDocument["state"]) => (st === "approved" ? colors.success : st === "rejected" ? colors.error : colors.warning);

  return (
    <View style={s.root} testID="pro-documents-screen">
      <StackHeader title={t("proStepDocuments")} />
      {!docs ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={s.hint}>{t("proDocsHint")}</Text>
          <ErrorText msg={err} />
          {DOC_TYPES.map((type) => {
            const mine = docs.filter((d) => d.type === type);
            return (
              <View key={type} style={s.card} testID={`pro-doc-${type}`}>
                <View style={s.head}>
                  <Text style={s.title}>{t(`doc_${type}` as TKey)}</Text>
                  <Text style={[s.tag, REQUIRED_DOCS.includes(type) && s.tagOn]}>{t(REQUIRED_DOCS.includes(type) ? "proDocRequired" : "proDocOptional")}</Text>
                </View>
                {mine.map((doc) => (
                  <View key={doc.id} style={s.file} testID={`pro-doc-file-${doc.id}`}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.state, { color: stateColor(doc.state) }]}>{t(`ds_${doc.state}` as TKey)}</Text>
                      {!!doc.review_note && <Text style={s.note}>{t("proDocNote")} : {doc.review_note}</Text>}
                    </View>
                    <Pressable testID={`pro-doc-open-${doc.id}`} onPress={() => open(doc)} style={s.action} hitSlop={6}>
                      <Text style={s.actionText}>{t("proOpen")}</Text>
                    </Pressable>
                    {doc.state === "pending" && (
                      <Pressable testID={`pro-doc-remove-${doc.id}`} onPress={() => remove(doc)} style={s.action} hitSlop={6} disabled={busy === doc.id}>
                        <Text style={[s.actionText, { color: colors.error }]}>{t("proRemove")}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable testID={`pro-doc-add-${type}`} onPress={() => add(type)} disabled={busy !== null} style={({ pressed }) => [s.add, pressed && { opacity: 0.8 }]}>
                  {busy === type ? <ActivityIndicator color={colors.brandPrimary} /> : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.brandPrimary} />
                      <Text style={s.addText}>{t("proUpload")}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  tag: { color: c.onSurfaceTertiary, backgroundColor: c.surfaceTertiary, fontSize: 11, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  tagOn: { backgroundColor: c.brandTertiary, color: c.onBrandTertiary },
  file: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: c.divider },
  state: { fontSize: 13, fontWeight: "600" },
  note: { color: c.muted, fontSize: 12, lineHeight: 17 },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  actionText: { color: c.brandPrimary, fontSize: 14, fontWeight: "600" },
  add: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, borderStyle: "dashed" },
  addText: { color: c.brandPrimary, fontSize: 14, fontWeight: "600" },
}));

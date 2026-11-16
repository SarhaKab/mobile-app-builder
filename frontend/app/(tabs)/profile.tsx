import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Chips, IconName, SectionTitle } from "@/src/components/ui";
import { Lang, TKey, useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Profile() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, updateProfile, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [out, setOut] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  if (!user) return null;

  const links: [IconName, string, string][] = [
    ["person-outline", t("contactTitle"), "/contact"], ["time-outline", t("workoutHistory"), "/history"],
    ["calendar-outline", t("myBookings"), "/booking"], ["nutrition-outline", t("nutritionTitle"), "/nutrition"], ["stats-chart-outline", t("progressTitle"), "/progress"],
    // L'espace d'administration n'est proposé qu'au rôle « admin » (la base applique la même règle).
    ...(user.role === "admin" ? [["settings-outline", t("adminContent"), "/admin"] as [IconName, string, string]] : []),
    // KFIT ON DEMAND : espace professionnel pour les coachs (ou pour le devenir), vérification des dossiers pour l'équipe.
    ...(user.role === "admin" || user.role === "support"
      ? [["shield-checkmark-outline", t("adminCoaches"), "/admin/coaches"] as [IconName, string, string]]
      : [["briefcase-outline", t(user.role === "coach" ? "proSpace" : "becomeCoach"), "/pro"] as [IconName, string, string]]),
  ];

  return (
    <View style={s.root} testID="profile-screen">
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + spacing.md, paddingBottom: bottomChrome + spacing.lg }]}>
        <View style={s.top}>
          {user.picture ? <Image source={user.picture} style={s.avatar} /> : (
            <View style={[s.avatar, s.avatarFallback]}><Text style={s.initial}>{user.name[0]?.toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.name} testID="profile-name">{user.name}</Text>
            <Text style={s.email} testID="profile-email">{user.email}</Text>
            <Text style={s.role} testID="profile-role">{t(`role_${user.role}` as TKey)}</Text>
          </View>
        </View>

        <Chips testID="profile-goal" label={t("goal")} value={user.goal as any} onChange={(g) => updateProfile({ goal: g })}
          options={(["muscle", "fat_loss", "balance", "endurance"] as const).map((v) => ({ value: v, label: t(v) }))} />
        <Chips testID="profile-lang" label={t("language")} value={user.lang} onChange={(l: Lang) => updateProfile({ lang: l })}
          options={[{ value: "en", label: "English" }, { value: "es", label: "Español" }, { value: "fr", label: "Français" }]} />

        <SectionTitle>{t("account")}</SectionTitle>
        <View style={s.group}>
          {links.map(([icon, label, href], i) => (
            <Pressable key={href} testID={`profile-link-${href.slice(1)}`} onPress={() => router.push(href as any)}
              style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
              <Ionicons name={icon} size={20} color={colors.brandPrimary} />
              <Text style={s.rowText}>{label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
        <View style={s.secure}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={s.secureText}>{t("security")}</Text>
        </View>
        <Button testID="profile-logout-button" variant="secondary" icon="log-out-outline" title={t("logout")} loading={out}
          onPress={async () => { setOut(true); await logout(); }} />
        <Text style={s.brand}>KFIT · {t("by")}</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.md, gap: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  initial: { color: c.onBrandSecondary, fontSize: 26, fontWeight: "700" },
  name: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  email: { color: c.muted, fontSize: 14 },
  role: { alignSelf: "flex-start", marginTop: 6, color: c.onBrandTertiary, backgroundColor: c.brandTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  group: { borderRadius: radius.md, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 56 },
  rowText: { flex: 1, color: c.onSurface, fontSize: 15 },
  secure: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secureText: { color: c.muted, fontSize: 13 },
  brand: { color: c.muted, fontSize: 11, letterSpacing: 3, textAlign: "center" },
}));

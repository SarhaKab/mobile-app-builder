import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TKey, useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Training() {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[] | null>(null);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useFocusEffect(useCallback(() => { api("/programs").then(setItems).catch(() => setItems([])); }, []));

  return (
    <View style={s.root} testID="training-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={s.title}>{t("programs")}</Text>
      </View>
      {!items ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[s.list, { paddingBottom: bottomChrome + spacing.lg }]}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 100)}>
              <Pressable testID={`program-card-${item.id}`} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: "/program/[id]", params: { id: item.id } })}>
                <Image source={item.image} style={s.img} contentFit="cover" transition={300} />
                <LinearGradient colors={["transparent", colors.surface]} locations={[0.2, 1]} style={s.img} />
                <View style={s.cardBody}>
                  <View style={s.badges}>
                    <Text style={s.badge}>{t(item.level as TKey)}</Text>
                    {user?.program_id === item.id && <Text style={[s.badge, s.badgeOn]}>{t("enrolled")}</Text>}
                  </View>
                  <Text style={s.cardTitle}>{item.title}</Text>
                  <Text style={s.desc} numberOfLines={2}>{item.desc[lang]}</Text>
                  <Text style={s.meta}>{item.weeks} {t("weeks")} · {item.count} {t("sessions")}</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.md },
  card: { height: 240, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary, justifyContent: "flex-end" },
  img: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  cardBody: { padding: spacing.md, gap: 4 },
  badges: { flexDirection: "row", gap: spacing.sm },
  badge: { color: c.onSurface, backgroundColor: c.overlay, fontSize: 11, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  badgeOn: { backgroundColor: c.brandPrimary, color: c.onBrandPrimary },
  cardTitle: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  desc: { color: c.onSurfaceSecondary, fontSize: 14 },
  meta: { color: c.brandPrimary, fontSize: 12, fontWeight: "600", marginTop: 2 },
}));

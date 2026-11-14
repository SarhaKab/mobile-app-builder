import Ionicons from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { useI18n } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { t } = useI18n();
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>{t("home")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="training">
          <NativeTabs.Trigger.Icon sf="dumbbell.fill" />
          <NativeTabs.Trigger.Label>{t("training")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="coach">
          <NativeTabs.Trigger.Icon sf="sparkles" />
          <NativeTabs.Trigger.Label>{t("coach")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf="person.fill" />
          <NativeTabs.Trigger.Label>{t("profile")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) =>
    ({ color, focused }: { color: string; focused: boolean }) =>
      <Ionicons name={(focused ? name : `${name}-outline`) as any} size={22} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.divider, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("home"), tabBarIcon: icon("home"), tabBarButtonTestID: "tab-home" } as any} />
      <Tabs.Screen name="training" options={{ title: t("training"), tabBarIcon: icon("barbell"), tabBarButtonTestID: "tab-training" } as any} />
      <Tabs.Screen name="coach" options={{ title: t("coach"), tabBarIcon: icon("sparkles"), tabBarButtonTestID: "tab-coach" } as any} />
      <Tabs.Screen name="profile" options={{ title: t("profile"), tabBarIcon: icon("person"), tabBarButtonTestID: "tab-profile" } as any} />
    </Tabs>
  );
}

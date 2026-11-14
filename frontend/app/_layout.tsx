import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { Emblem } from "@/src/components/ui";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { AuthProvider, useAuth } from "@/src/auth";
import { I18nProvider } from "@/src/i18n";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

const PUBLIC = ["welcome", "login"];

function Gate() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    const inPublic = PUBLIC.includes(segments[0] ?? "");
    if (!user && !inPublic) router.replace("/welcome");
    else if (user && (inPublic || !segments[0])) router.replace("/(tabs)");
  }, [user, segments, router]);

  if (user === undefined) {
    return (
      <View testID="app-loading" style={[styles.root, styles.center, { backgroundColor: colors.surface }]}>
        <Emblem size={64} />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <I18nProvider>
              <AuthProvider>
                <StatusBar style="light" />
                <Gate />
              </AuthProvider>
            </I18nProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
});

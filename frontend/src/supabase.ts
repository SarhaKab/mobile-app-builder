// Client Supabase de KFIT.
// L'URL et la clé « publishable » sont publiques par conception : la protection des
// données repose sur les règles RLS de la base, jamais sur le secret de cette clé.
// Aucune clé secrète (sb_secret_…, service_role) ne doit apparaître dans l'application.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://soaivvemysgzmjntmkta.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy";

// Sur téléphone, la session est rangée dans le trousseau sécurisé (Keychain / Keystore).
// SecureStore limite chaque valeur à ~2 Ko alors qu'une session en fait davantage :
// on la découpe donc en morceaux. Les clés ne contiennent que [A-Za-z0-9._-].
const CHUNK = 500;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

const secureChunkedStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    const previous = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${k}.n`, String(count));
    for (let i = count; i < previous; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: Platform.OS === "web" ? (AsyncStorage as any) : secureChunkedStorage,
    storageKey: "kfit-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Le renouvellement automatique du jeton ne tourne que lorsque l'application est au premier plan.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

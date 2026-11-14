import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setApiToken, setUnauthorizedHandler } from "@/src/api";
import { Lang, useI18n } from "@/src/i18n";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string; email: string; name: string; picture?: string; lang: Lang;
  goal?: string; program_id?: string; auth_provider: string;
};
type AuthOut = { token: string; user: User };

type Ctx = {
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (p: Partial<Pick<User, "name" | "lang" | "goal">>) => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<Ctx>(null as any);
const TOKEN_KEY = "auth_token";

const extractSid = (url?: string | null) => url?.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { lang, setLang } = useI18n();
  const sent = useRef(new Set<string>());

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setApiToken(null);
    setUser(null);
  }, []);

  const apply = useCallback(async (out: AuthOut) => {
    await storage.secureSet(TOKEN_KEY, out.token);
    setApiToken(out.token);
    setLang(out.user.lang);
    setUser(out.user);
  }, [setLang]);

  const exchange = useCallback(async (sid: string) => {
    if (sent.current.has(sid)) return;
    sent.current.add(sid);
    const out = await api<AuthOut>("/auth/session", { method: "POST", body: { session_id: sid } });
    await apply(out);
    if (Platform.OS === "web") {
      const u = new URL(window.location.href);
      u.searchParams.delete("session_id");
      u.hash = u.hash.replace(/session_id=[^&]+&?/, "").replace(/^#$/, "");
      window.history.replaceState(window.history.state, "", u.toString());
    }
  }, [apply]);

  useEffect(() => {
    setUnauthorizedHandler(() => { clear(); });
    (async () => {
      try {
        const sid = Platform.OS === "web" ? extractSid(window.location.href) : extractSid(await Linking.getInitialURL());
        if (sid) {
          await exchange(sid);
          return;
        }
        const tok = await storage.secureGet(TOKEN_KEY, null);
        if (!tok) return setUser(null);
        setApiToken(tok as string);
        const me = await api<User>("/auth/me");
        setLang(me.lang);
        setUser(me);
      } catch {
        await clear();
      }
    })();
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSid(url);
      if (sid) exchange(sid).catch(() => {});
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) =>
    apply(await api<AuthOut>("/auth/login", { method: "POST", body: { email, password } }));

  const register = async (name: string, email: string, password: string) =>
    apply(await api<AuthOut>("/auth/register", { method: "POST", body: { name, email, password, lang } }));

  const loginGoogle = async () => {
    const redirectUrl = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => { captured = url; });
    try {
      const res = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      const url = (res.type === "success" ? res.url : null) || captured || (await Linking.getInitialURL());
      const sid = extractSid(url);
      if (sid) await exchange(sid);
    } finally {
      sub.remove();
    }
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await clear();
  };

  const updateProfile = async (p: Partial<Pick<User, "name" | "lang" | "goal">>) => {
    const u = await api<User>("/profile", { method: "PATCH", body: p });
    if (p.lang) setLang(p.lang);
    setUser(u);
  };

  const refresh = async () => setUser(await api<User>("/auth/me"));

  return (
    <AuthContext.Provider value={{ user, login, register, loginGoogle, logout, updateProfile, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

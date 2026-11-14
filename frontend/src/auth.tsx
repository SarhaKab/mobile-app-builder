// Authentification KFIT — Supabase Auth (e-mail + mot de passe).
//
// Opérationnel : inscription, connexion, déconnexion, session persistante et
// renouvelée automatiquement, profil (nom, langue, rôle) lu dans la table `users`.
// Non intégré (rien n'est simulé) : connexion Google/Apple, réinitialisation du
// mot de passe. Voir docs/AUTH.md.
//
// Transition : les écrans existants (programmes, coach IA, nutrition, réservations)
// parlent encore à l'ancien serveur FastAPI. Celui-ci accepte désormais le jeton
// Supabase ; on y lit les champs historiques (objectif, programme en cours).
import type { Session } from "@supabase/supabase-js";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { api, setTokenProvider } from "@/src/api";
import { Lang, LANGS, useI18n } from "@/src/i18n";
import { supabase } from "@/src/supabase";

export type Role = "client" | "coach" | "support" | "admin";

export type User = {
  user_id: string; email: string; name: string; picture?: string; lang: Lang; role: Role;
  goal?: string; program_id?: string; auth_provider: string;
};

// "signed_in" : session ouverte. "confirm_email" : compte créé, e-mail à confirmer.
export type RegisterResult = "signed_in" | "confirm_email";

// Codes d'erreur traduits dans i18n (clés authErr_*).
export type AuthErrorCode = "invalid_credentials" | "email_not_confirmed" | "user_already_exists"
  | "weak_password" | "rate_limited" | "email_invalid" | "network" | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
  }
}

function toAuthError(e: any): AuthError {
  const code: string = e?.code ?? "";
  if (code === "invalid_credentials") return new AuthError("invalid_credentials");
  if (code === "email_not_confirmed") return new AuthError("email_not_confirmed");
  if (code === "user_already_exists" || code === "email_exists") return new AuthError("user_already_exists");
  if (code === "weak_password") return new AuthError("weak_password");
  // Adresse refusée par Supabase (domaine inexistant ou de test, format invalide).
  if (code === "email_address_invalid" || code === "validation_failed") return new AuthError("email_invalid");
  // Aucune réponse du serveur : seul cas où l'on parle de connexion à l'utilisateur.
  if (e?.name === "AuthRetryableFetchError" || e?.status === 0) return new AuthError("network");
  if (code.startsWith("over_") || e?.status === 429) return new AuthError("rate_limited");
  return new AuthError("unknown");
}

type Ctx = {
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  updateProfile: (p: Partial<Pick<User, "name" | "lang" | "goal">>) => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<Ctx>(null as any);

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

async function loadUser(session: Session): Promise<User> {
  const su = session.user;
  const meta = (su.user_metadata ?? {}) as Record<string, any>;
  const base: User = {
    user_id: su.id,
    email: su.email ?? "",
    name: meta.full_name || (su.email ?? "").split("@")[0] || "KFIT",
    lang: LANGS.includes(meta.lang) ? meta.lang : "fr",
    role: "client",
    auth_provider: "email",
  };
  try {
    const { data } = await supabase.from("users").select("role, full_name, lang").eq("id", su.id).maybeSingle();
    if (data) {
      base.role = data.role as Role;
      if (data.full_name) base.name = data.full_name;
      if (LANGS.includes(data.lang)) base.lang = data.lang as Lang;
    }
  } catch {
    // profil indisponible : on garde les informations de la session
  }
  try {
    const legacy = await withTimeout(api<Partial<User>>("/auth/me"), 6000);
    base.goal = legacy.goal;
    base.program_id = legacy.program_id;
  } catch {
    // ancien serveur indisponible : l'utilisateur reste connecté
  }
  return base;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { lang, setLang } = useI18n();
  const currentId = useRef<string | null>(null);

  const apply = useCallback(async (session: Session | null) => {
    if (!session) {
      currentId.current = null;
      setUser(null);
      return;
    }
    currentId.current = session.user.id;
    const u = await loadUser(session);
    if (currentId.current !== u.user_id) return; // déconnexion ou changement de compte entre-temps
    setLang(u.lang);
    setUser(u);
  }, [setLang]);

  useEffect(() => {
    setTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Un simple renouvellement de jeton ne change pas l'utilisateur.
      if (event === "TOKEN_REFRESHED" && session && currentId.current === session.user.id) return;
      // Ne jamais appeler Supabase directement dans ce rappel (risque de blocage) : on diffère.
      setTimeout(() => { apply(session).catch(() => setUser(null)); }, 0);
    });
    return () => subscription.unsubscribe();
  }, [apply]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAuthError(error);
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: name, lang } },
    });
    if (error) throw toAuthError(error);
    // Adresse déjà utilisée : Supabase renvoie un utilisateur factice sans identité.
    if (data.user && (data.user.identities?.length ?? 0) === 0) throw new AuthError("user_already_exists");
    return data.session ? "signed_in" : "confirm_email";
  };

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    currentId.current = null;
    setUser(null);
  };

  const updateProfile = async (p: Partial<Pick<User, "name" | "lang" | "goal">>) => {
    if (!user) return;
    const row: Record<string, string> = {};
    if (p.name !== undefined) row.full_name = p.name;
    if (p.lang !== undefined) row.lang = p.lang;
    if (Object.keys(row).length) {
      const { error } = await supabase.from("users").update(row).eq("id", user.user_id);
      if (error) throw new Error(error.message);
    }
    // Champs encore gérés par l'ancien serveur (objectif) — au mieux.
    await api("/profile", { method: "PATCH", body: p }).catch(() => {});
    if (p.lang) setLang(p.lang);
    setUser({ ...user, ...p });
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    await apply(data.session);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

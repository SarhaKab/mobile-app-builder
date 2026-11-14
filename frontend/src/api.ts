import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

export const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

// Le jeton est demandé à Supabase à chaque appel : il est ainsi toujours valide,
// y compris juste après un renouvellement automatique.
let tokenProvider: () => Promise<string | null> = async () => null;

export const setTokenProvider = (fn: () => Promise<string | null>) => {
  tokenProvider = fn;
};

async function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = await tokenProvider().catch(() => null);
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: await headers(),
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(Array.isArray(d) ? d.map((x: any) => x.msg).join(", ") : d ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// Server-sent events stream (AI coach). expo/fetch supports streaming bodies on native.
export async function streamChat(message: string, onDelta: (s: string) => void) {
  const f: typeof expoFetch = Platform.OS === "web" ? (globalThis.fetch as any) : expoFetch;
  const res = await f(`${API_URL}/coach/chat`, { method: "POST", headers: await headers(), body: JSON.stringify({ message }) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.replace(/^data: /, "").trim();
      if (!line || line === "[DONE]") continue;
      const ev = JSON.parse(line);
      if (ev.error) throw new Error(ev.error);
      if (ev.delta) onDelta(ev.delta);
    }
  }
}

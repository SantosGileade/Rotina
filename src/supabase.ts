import { createClient } from "@supabase/supabase-js";

// Estes valores são públicos no cliente web. O acesso aos dados continua protegido pelo RLS.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://gxestbjokiwvixowtiaz.supabase.co";
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "sb_publishable_iZUIzbsLx6hIwvcShD-fBQ_GKKBypzP";

export const supabaseConfigured = Boolean(url && publishableKey);
export const supabase = createClient(url || "https://invalid.supabase.co", publishableKey || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export async function ensureAnonymousSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const result = await supabase.auth.signInAnonymously({ options: { data: { display_name: "Rotina" } } });
  if (result.error) throw result.error;
  if (!result.data.user) throw new Error("Não foi possível iniciar a sessão do aparelho.");
  return result.data.user;
}

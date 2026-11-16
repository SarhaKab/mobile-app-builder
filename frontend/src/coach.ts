// KFIT ON DEMAND — espace professionnel coach et vérification par l'équipe KFIT.
//
// Toutes les règles sont appliquées par la base (RLS + déclencheurs), pas par l'application :
// plafond tarifaire du marché, dossier complet avant envoi, validation réservée à l'équipe,
// justificatifs privés (lisibles par le coach concerné et l'équipe uniquement).
import { supabase } from "@/src/supabase";

export const COACH_STATUSES = ["registration_in_progress", "documents_missing", "under_review", "approved", "rejected", "suspended"] as const;
export type CoachStatus = (typeof COACH_STATUSES)[number];

export const DOC_TYPES = ["identity", "professional_photo", "cv", "diploma", "liability_insurance",
  "qualification", "independent_status_proof", "tax_rfc", "first_aid"] as const;
export type DocType = (typeof DOC_TYPES)[number];
// Même liste que la fonction coach_required_documents() de la base, qui fait foi.
export const REQUIRED_DOCS: DocType[] = ["identity", "professional_photo", "cv", "diploma", "liability_insurance"];
export type ReviewState = "pending" | "approved" | "rejected";

export const SPECIALTIES = ["strength", "weight_loss", "cardio", "hiit", "yoga", "pilates", "mobility",
  "boxing", "running", "functional", "prenatal", "seniors", "rehab"] as const;

export type Market = {
  code: string; name: string; currency: string; max_hourly_rate_cents: number;
  min_hourly_rate_cents: number | null; search_radius_km: number; timezone: string;
};
export type CoachProfile = {
  user_id: string; market_code: string; display_name: string; headline: string | null; bio: string | null;
  specialties: string[]; experience_years: number | null; experience_summary: string | null;
  hourly_rate_cents: number | null; currency: string | null; status: CoachStatus; status_reason: string | null;
  is_paused: boolean; sessions_completed: number; rating_avg: number | null; rating_count: number; updated_at: string;
};
export type CoachDocument = {
  id: string; coach_id: string; type: DocType; storage_path: string; state: ReviewState;
  review_note: string | null; created_at: string;
};
export type Slot = { id: string; weekday: number; start_time: string; end_time: string };
export type ServiceArea = { id: string; label: string | null; radius_km: number };
export type PickedFile = { uri: string; name: string; mimeType?: string | null };

const COACH_COLS = "user_id,market_code,display_name,headline,bio,specialties,experience_years,experience_summary," +
  "hourly_rate_cents,currency,status,status_reason,is_paused,sessions_completed,rating_avg,rating_count,updated_at";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const formatMoney = (cents: number | null | undefined, currency: string | null | undefined) =>
  cents == null ? "—" : `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
export const hhmm = (time: string) => time.slice(0, 5);

// ----------------------------------------------------------------- coach
export const listMarkets = async () =>
  unwrap<Market[]>(await supabase.from("markets")
    .select("code,name,currency,max_hourly_rate_cents,min_hourly_rate_cents,search_radius_km,timezone").eq("is_active", true).order("name"));

export const getCoach = async (userId: string) =>
  unwrap<CoachProfile | null>(await supabase.from("coach_profiles").select(COACH_COLS).eq("user_id", userId).maybeSingle() as any);

/** Ouvre un dossier coach (« inscription en cours »). Aucune réservation possible avant validation humaine. */
export const startCoachRegistration = async (marketCode: string) =>
  unwrap(await supabase.rpc("start_coach_registration", { p_market: marketCode }));

export type CoachPatch = Partial<Pick<CoachProfile, "display_name" | "headline" | "bio" | "specialties" |
  "experience_years" | "experience_summary" | "hourly_rate_cents" | "is_paused">>;
export const saveCoach = async (userId: string, patch: CoachPatch) =>
  unwrap(await supabase.from("coach_profiles").update(patch).eq("user_id", userId).select("user_id").single());

/** Ce qui manque au dossier : codes « doc_<type> » ou nom de champ (display_name, bio, hourly_rate…). */
export const missingRequirements = async (coachId: string) =>
  unwrap<string[] | null>(await supabase.rpc("coach_missing_requirements", { p_coach: coachId })) ?? [];

/** Envoi du dossier : la base refuse s'il est incomplet. */
export const submitForReview = async (userId: string) =>
  unwrap(await supabase.from("coach_profiles").update({ status: "under_review" }).eq("user_id", userId).select("user_id").single());

/** Recours contre une décision (refus, suspension) : toujours examiné par une personne. */
export const appealDecision = async (userId: string, description: string) =>
  unwrap(await supabase.from("complaints").insert({ author_id: userId, kind: "appeal_account_decision", description }).select("id").single());

// ----------------------------------------------------------------- disponibilités et zone
export const listSlots = async (coachId: string) =>
  unwrap<Slot[]>(await supabase.from("coach_availability").select("id,weekday,start_time,end_time")
    .eq("coach_id", coachId).order("weekday").order("start_time"));
export const addSlot = async (coachId: string, weekday: number, start: string, end: string) =>
  unwrap(await supabase.from("coach_availability").insert({ coach_id: coachId, weekday, start_time: start, end_time: end }).select("id").single());
export const removeSlot = async (id: string) =>
  unwrap(await supabase.from("coach_availability").delete().eq("id", id).select("id"));

export const getServiceArea = async (coachId: string) =>
  unwrap<ServiceArea | null>(await supabase.from("coach_service_areas").select("id,label,radius_km")
    .eq("coach_id", coachId).order("created_at", { ascending: false }).limit(1).maybeSingle());
/** Enregistre le centre et le rayon de la zone. Aucune position n'est suivie en continu. */
export const setServiceArea = async (lat: number, lng: number, radiusKm: number, label: string | null) =>
  unwrap(await supabase.rpc("set_service_area", { p_lat: lat, p_lng: lng, p_radius_km: radiusKm, p_label: label }));

// ----------------------------------------------------------------- justificatifs
const DOC_BUCKET = "coach-documents";
const DOC_COLS = "id,coach_id,type,storage_path,state,review_note,created_at";

export const listDocuments = async (coachId: string) =>
  unwrap<CoachDocument[]>(await supabase.from("coach_documents").select(DOC_COLS).eq("coach_id", coachId).order("created_at"));

export async function uploadDocument(coachId: string, type: DocType, file: PickedFile) {
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
  const contentType = file.mimeType || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);
  // Le premier dossier du chemin est l'identifiant du coach : c'est ce que vérifient les règles du stockage.
  const path = `${coachId}/${type}-${Date.now()}.${ext}`;
  const body = await (await fetch(file.uri)).arrayBuffer();
  const up = await supabase.storage.from(DOC_BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) throw new Error(up.error.message);
  try {
    return unwrap<CoachDocument>(await supabase.from("coach_documents")
      .insert({ coach_id: coachId, type, storage_path: path }).select(DOC_COLS).single() as any);
  } catch (e) {
    await supabase.storage.from(DOC_BUCKET).remove([path]); // pas de fichier orphelin
    throw e;
  }
}

/** Retrait d'une pièce encore en attente (la base refuse pour une pièce déjà examinée). */
export async function removeDocument(doc: CoachDocument) {
  const rows = unwrap<{ id: string }[]>(await supabase.from("coach_documents").delete().eq("id", doc.id).select("id"));
  if (!rows.length) throw new Error("document already reviewed");
  await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
}

/** Lien de consultation valable 5 minutes. */
export const signedDocumentUrl = async (path: string) => {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

// ----------------------------------------------------------------- équipe KFIT (admin, support)
export const listCoachFiles = async (status: CoachStatus) =>
  unwrap<CoachProfile[]>(await supabase.from("coach_profiles").select(COACH_COLS).eq("status", status).order("updated_at") as any);

export const reviewDocument = async (id: string, state: ReviewState, note: string | null) =>
  unwrap(await supabase.from("coach_documents").update({ state, review_note: note }).eq("id", id).select("id").single());

/** Décision motivée sur un dossier ; le coach est notifié et la décision est journalisée. */
export const reviewCoach = async (coachId: string, status: "approved" | "rejected" | "documents_missing" | "suspended", reason: string | null) =>
  unwrap(await supabase.rpc("review_coach", { p_coach: coachId, p_status: status, p_reason: reason }));

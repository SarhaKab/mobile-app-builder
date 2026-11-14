// KFIT HOME — accès aux contenus (programmes, vidéos, exercices), favoris, historique.
// Les données vivent dans Supabase ; la sécurité repose sur les règles RLS :
// un client ne lit que les contenus publiés et n'écrit que ses propres favoris / historique.
import { Lang } from "@/src/i18n";
import { supabase, SUPABASE_URL } from "@/src/supabase";

export const GOALS = ["weight_loss", "muscle_gain", "strengthening", "cardio", "mobility", "fitness_recovery"] as const;
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Goal = (typeof GOALS)[number];
export type Level = (typeof LEVELS)[number];
export type L10n = Partial<Record<Lang, string>>;
export type FavType = "program" | "video" | "exercise";

export type Program = {
  id: string; slug: string; title: L10n; description: L10n; goal: Goal | null; level: Level; weeks: number | null;
  cover_path: string | null; is_premium: boolean; is_published: boolean; videos?: { count: number }[];
  coach?: { display_name: string; headline: string | null } | null;
};
export type Video = {
  id: string; program_id: string | null; position: number; title: L10n; description: L10n; duration_seconds: number | null;
  level: Level | null; goal: Goal | null; storage_path: string | null; is_premium: boolean; is_published: boolean;
  program?: { title: L10n; cover_path: string | null } | null;
};
export type LevelVariant = { sets?: number | null; reps?: string | null; rest_seconds?: number | null; note?: L10n };
export type Exercise = {
  id: string; slug: string; name: L10n; instructions: L10n; muscle_groups: string[]; equipment: string[];
  level: Level | null; is_published: boolean; media_path: string | null; level_variants: Partial<Record<Level, LevelVariant>>;
};

// Vidéos : fichiers du stockage privé « videos », lus par URL signée de courte durée.
// Un chemin sous « drafts/ » est un brouillon en attente de validation : seuls les administrateurs le voient.
export const DRAFT_PREFIX = "drafts/";
export const isDraftMedia = (path: string | null | undefined) => !!path?.startsWith(DRAFT_PREFIX);
export const signedVideoUrl = async (path: string) => {
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};
/** Valide une vidéo brouillon : le fichier quitte « drafts/ » et devient visible des clients. */
export const approveExerciseMedia = async (exerciseId: string, path: string) => {
  const to = path.slice(DRAFT_PREFIX.length);
  await supabase.storage.from("videos").remove([to]); // remplace une éventuelle version précédente
  const { error } = await supabase.storage.from("videos").move(path, to);
  if (error) throw new Error(error.message);
  unwrap(await supabase.from("exercises").update({ media_path: to }).eq("id", exerciseId));
  return to;
};
export const removeExerciseMedia = async (exerciseId: string, path: string) => {
  unwrap(await supabase.from("exercises").update({ media_path: null }).eq("id", exerciseId));
  await supabase.storage.from("videos").remove([path]);
};
export type VideoExercise = { position: number; sets: number | null; reps: string | null; exercise: Pick<Exercise, "id" | "name" | "level"> };
export type HistoryRow = {
  id: string; video_id: string | null; program_id: string | null; completed_at: string; minutes: number | null;
  video?: { title: L10n } | null; program?: { title: L10n } | null;
};

/** Texte dans la langue de l'utilisateur, avec repli sur une autre langue renseignée. */
export const loc = (v: L10n | null | undefined, lang: Lang) => v?.[lang] || v?.en || v?.fr || v?.es || "";

/** Image de couverture : adresse complète, ou chemin dans le stockage public KFIT. */
export const coverUrl = (path: string | null | undefined) =>
  !path ? null : /^https?:\/\//.test(path) ? path : `${SUPABASE_URL}/storage/v1/object/public/public-media/${path}`;

export const minutesOf = (v: Pick<Video, "duration_seconds">) => (v.duration_seconds ? Math.round(v.duration_seconds / 60) : null);

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const PROGRAM_COLS = "id,slug,title,description,goal,level,weeks,cover_path,is_premium,is_published";
const VIDEO_COLS = "id,program_id,position,title,description,duration_seconds,level,goal,storage_path,is_premium,is_published";
const EXERCISE_COLS = "id,slug,name,instructions,muscle_groups,equipment,level,is_published,media_path,level_variants";

// `all` = inclure les contenus non publiés (administration ; refusé par la base aux autres rôles).
export const listPrograms = async (all = false) => {
  let q = supabase.from("programs").select(`${PROGRAM_COLS},videos(count)`).order("created_at");
  if (!all) q = q.eq("is_published", true);
  return unwrap<Program[]>(await q);
};
export const listVideos = async (all = false) => {
  let q = supabase.from("videos").select(`${VIDEO_COLS},program:programs(title,cover_path)`).order("program_id").order("position");
  if (!all) q = q.eq("is_published", true);
  return unwrap<Video[]>(await q as any);
};
export const listExercises = async (all = false) => {
  let q = supabase.from("exercises").select(EXERCISE_COLS).order("slug");
  if (!all) q = q.eq("is_published", true);
  return unwrap<Exercise[]>(await q);
};

export const getProgram = async (id: string) =>
  unwrap<Program | null>(await supabase.from("programs")
    .select(`${PROGRAM_COLS},coach:coach_profiles(display_name,headline)`).eq("id", id).maybeSingle() as any);
export const programVideos = async (programId: string) =>
  unwrap<Video[]>(await supabase.from("videos").select(VIDEO_COLS).eq("program_id", programId).eq("is_published", true).order("position"));
export const getVideo = async (id: string) =>
  unwrap<Video | null>(await supabase.from("videos").select(`${VIDEO_COLS},program:programs(title,cover_path)`).eq("id", id).maybeSingle() as any);
export const videoExercises = async (videoId: string) =>
  unwrap<VideoExercise[]>(await supabase.from("video_exercises")
    .select("position,sets,reps,exercise:exercises(id,name,level)").eq("video_id", videoId).order("position") as any);
export const getExercise = async (id: string) =>
  unwrap<Exercise | null>(await supabase.from("exercises").select(EXERCISE_COLS).eq("id", id).maybeSingle());

// ---------------------------------------------------------------- favoris
export const listFavorites = async (userId: string, type: FavType) =>
  new Set(unwrap<{ item_id: string }[]>(await supabase.from("favorites").select("item_id")
    .eq("user_id", userId).eq("item_type", type)).map((f) => f.item_id));
export const setFavorite = async (userId: string, type: FavType, itemId: string, on: boolean) => {
  const row = { user_id: userId, item_type: type, item_id: itemId };
  unwrap(on ? await supabase.from("favorites").upsert(row) : await supabase.from("favorites").delete().match(row));
};

// ---------------------------------------------------------------- historique et programme suivi
export const listHistory = async (userId: string) =>
  unwrap<HistoryRow[]>(await supabase.from("workout_history")
    .select("id,video_id,program_id,completed_at,minutes,video:videos(title),program:programs(title)")
    .eq("user_id", userId).order("completed_at", { ascending: false }).limit(200) as any);
export const completeVideo = async (userId: string, v: Video) =>
  unwrap(await supabase.from("workout_history")
    .insert({ user_id: userId, video_id: v.id, program_id: v.program_id, minutes: minutesOf(v) }));

export const isEnrolled = async (userId: string, programId: string) =>
  !!unwrap(await supabase.from("program_enrollments").select("program_id").eq("user_id", userId).eq("program_id", programId).maybeSingle());
export const enroll = async (userId: string, programId: string) =>
  unwrap(await supabase.from("program_enrollments").upsert({ user_id: userId, program_id: programId, started_at: new Date().toISOString() }));

/** Séances terminées d'un programme (identifiants de vidéos). */
export const doneVideoIds = (history: HistoryRow[], programId: string) =>
  new Set(history.filter((h) => h.program_id === programId && h.video_id).map((h) => h.video_id as string));

/** Résumé pour l'accueil : programme suivi le plus récent, prochaine séance, totaux. */
export async function homeSummary(userId: string) {
  const [history, enrollment] = await Promise.all([
    listHistory(userId),
    supabase.from("program_enrollments").select("program_id").eq("user_id", userId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle().then(unwrap<{ program_id: string } | null>),
  ]);
  const totals = { workouts: history.length, minutes: history.reduce((n, h) => n + (h.minutes ?? 0), 0) };
  if (!enrollment) return { ...totals, program: null };
  const [program, videos] = await Promise.all([getProgram(enrollment.program_id), programVideos(enrollment.program_id)]);
  if (!program) return { ...totals, program: null };
  const done = doneVideoIds(history, program.id);
  return { ...totals, program: { ...program, total: videos.length, done: videos.filter((v) => done.has(v.id)).length, next: videos.find((v) => !done.has(v.id)) ?? null } };
}

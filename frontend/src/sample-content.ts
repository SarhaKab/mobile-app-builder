// Contenus d'EXEMPLE pour KFIT HOME, chargés par un administrateur depuis l'écran
// d'administration. Ce sont les trois programmes du prototype, repris tels quels.
// Ils sont identifiables (slug préfixé « sample- ») et entièrement modifiables ou supprimables.
// Aucune vidéo réelle n'est fournie : les séances n'ont pas de fichier vidéo tant qu'il n'est pas ajouté.
import { Goal, Level, L10n } from "@/src/home";
import { supabase } from "@/src/supabase";

export const SAMPLE_PREFIX = "sample-";

type Ex = [name: string, sets: number, reps: string];
type Session = { title: string; minutes: number; exercises: Ex[] };
type SampleProgram = { slug: string; title: string; description: L10n; goal: Goal; level: Level; weeks: number; cover: string; sessions: Session[] };

const PROGRAMS: SampleProgram[] = [
  { slug: "strength-balance", title: "Strength & Balance", goal: "strengthening", level: "intermediate", weeks: 8,
    cover: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900",
    description: { en: "Build functional strength and stability with full-body sessions.",
      es: "Desarrolla fuerza funcional y estabilidad con sesiones de cuerpo completo.",
      fr: "Développe force fonctionnelle et stabilité avec des séances full-body." },
    sessions: [
      { title: "Upper Body", minutes: 45, exercises: [["Push-ups", 4, "12"], ["Dumbbell Row", 4, "10"], ["Overhead Press", 3, "10"], ["Plank", 3, "45s"]] },
      { title: "Lower Body", minutes: 50, exercises: [["Goblet Squat", 4, "12"], ["Romanian Deadlift", 4, "10"], ["Walking Lunges", 3, "20"], ["Glute Bridge", 3, "15"]] },
      { title: "Core & Mobility", minutes: 30, exercises: [["Dead Bug", 3, "12"], ["Side Plank", 3, "30s"], ["Bird Dog", 3, "12"], ["Hip Flow", 2, "5 min"]] },
      { title: "Full Body Power", minutes: 45, exercises: [["Kettlebell Swing", 5, "15"], ["Burpees", 4, "10"], ["Thrusters", 4, "10"], ["Farmer Carry", 3, "40m"]] },
    ] },
  { slug: "hypertrophy", title: "Hypertrophy", goal: "muscle_gain", level: "advanced", weeks: 8,
    cover: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=900",
    description: { en: "Progressive overload split to maximize muscle gain.",
      es: "Rutina dividida con sobrecarga progresiva para ganar músculo.",
      fr: "Split en surcharge progressive pour maximiser la prise de muscle." },
    sessions: [
      { title: "Push", minutes: 60, exercises: [["Bench Press", 4, "8"], ["Incline DB Press", 4, "10"], ["Lateral Raise", 4, "15"], ["Triceps Dips", 3, "12"]] },
      { title: "Pull", minutes: 60, exercises: [["Pull-ups", 4, "8"], ["Barbell Row", 4, "8"], ["Face Pull", 3, "15"], ["Curl", 4, "12"]] },
      { title: "Legs", minutes: 65, exercises: [["Back Squat", 5, "6"], ["Leg Press", 4, "12"], ["Hamstring Curl", 4, "12"], ["Calf Raise", 4, "15"]] },
    ] },
  { slug: "tulum-shred", title: "Tulum Shred", goal: "weight_loss", level: "beginner", weeks: 6,
    cover: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900",
    description: { en: "Outdoor conditioning and fat loss inspired by the jungle and the beach.",
      es: "Acondicionamiento al aire libre y pérdida de grasa inspirados en la selva y la playa.",
      fr: "Conditionnement outdoor et perte de gras inspirés par la jungle et la plage." },
    sessions: [
      { title: "Beach HIIT", minutes: 30, exercises: [["Sprint", 8, "20s"], ["Jump Squats", 4, "15"], ["Mountain Climbers", 4, "30s"], ["Bear Crawl", 3, "20m"]] },
      { title: "Jungle Circuit", minutes: 40, exercises: [["Step-ups", 4, "12"], ["Push-ups", 4, "10"], ["Skater Jumps", 4, "20"], ["Hollow Hold", 3, "30s"]] },
      { title: "Recovery Flow", minutes: 25, exercises: [["Breathwork", 1, "5 min"], ["Yoga Flow", 1, "15 min"], ["Stretching", 1, "5 min"]] },
    ] },
];

const all = (s: string): L10n => ({ fr: s, en: s, es: s });
const slugify = (s: string) => SAMPLE_PREFIX + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const check = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data;
};

/** Charge (ou complète) les contenus d'exemple. Peut être relancé sans créer de doublons. */
export async function loadSampleContent(): Promise<{ programs: number; videos: number; exercises: number }> {
  const names = [...new Set(PROGRAMS.flatMap((p) => p.sessions.flatMap((s) => s.exercises.map((e) => e[0]))))];
  const exercises = check(await supabase.from("exercises")
    .upsert(names.map((n) => ({ slug: slugify(n), name: all(n), is_published: true })), { onConflict: "slug", ignoreDuplicates: true })
    .select("id")) ?? [];
  const exRows = check(await supabase.from("exercises").select("id,slug").like("slug", `${SAMPLE_PREFIX}%`)) ?? [];
  const exId = new Map(exRows.map((e) => [e.slug, e.id]));

  let programs = 0, videos = 0;
  for (const p of PROGRAMS) {
    const slug = SAMPLE_PREFIX + p.slug;
    let row = check(await supabase.from("programs").select("id").eq("slug", slug).maybeSingle());
    if (!row) {
      row = check(await supabase.from("programs").insert({
        slug, title: all(p.title), description: p.description, goal: p.goal, level: p.level, weeks: p.weeks,
        cover_path: p.cover, is_published: true,
      }).select("id").single());
      programs++;
    }
    const { count, error } = await supabase.from("videos").select("id", { count: "exact", head: true }).eq("program_id", row!.id);
    if (error) throw new Error(error.message);
    if (count) continue;
    for (const [i, s] of p.sessions.entries()) {
      const v = check(await supabase.from("videos").insert({
        program_id: row!.id, position: i, title: all(s.title), duration_seconds: s.minutes * 60,
        level: p.level, goal: p.goal, is_published: true,
      }).select("id").single());
      videos++;
      check(await supabase.from("video_exercises").insert(s.exercises.map(([n, sets, reps], j) => (
        { video_id: v!.id, exercise_id: exId.get(slugify(n)), position: j, sets, reps }))));
    }
  }
  return { programs, videos, exercises: exercises.length };
}

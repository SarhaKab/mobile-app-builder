import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

export type Lang = "en" | "es" | "fr";
export const LANGS: Lang[] = ["en", "es", "fr"];

const en = {
  tagline: "TRAIN SMARTER. LIVE STRONGER.",
  by: "BY T7 CORP",
  welcomeTitle: "Your tailor-made coaching in Tulum.",
  f1: "Personalized programs", f2: "Smart nutrition (AI)", f3: "Track your progress", f4: "Online & on-site coaching",
  getStarted: "Get started", haveAccount: "I already have an account",
  login: "Sign in", register: "Create account", email: "Email", password: "Password", name: "First name",
  pwHint: "Minimum 8 characters", google: "Continue with Google", or: "or",
  noAccount: "No account yet? Create one", gotAccount: "Already a member? Sign in",
  hello: "Hello", letsTrain: "Let's train smarter.",
  workouts: "Workouts", nutrition: "Nutrition", progress: "Progress", coaching: "Coaching",
  yourProgram: "Your program", noProgram: "Choose a program to start", browse: "Browse programs",
  nextWorkout: "Next workout", done: "Program completed!", minutes: "min", kcal: "kcal", kg: "kg",
  stats: "Your stats", nextSession: "Next coaching session", none: "None booked",
  home: "Home", training: "Training", coach: "Coach", profile: "Profile",
  programs: "Programs", weeks: "weeks", sessions: "sessions",
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  enroll: "Start this program", enrolled: "Current program", markDone: "Mark as done", completed: "Completed",
  exercises: "Exercises", sets: "sets",
  coachTitle: "AI Coach", coachIntro: "Ask me anything about training, recovery or nutrition.",
  typeMessage: "Message your coach…", clear: "Clear",
  s1: "Build me a 20 min workout", s2: "How to recover faster?", s3: "Best pre-workout meal?", s4: "Motivate me today",
  nutritionTitle: "AI Nutrition Plan", goal: "Goal", sex: "Sex", male: "Male", female: "Female",
  age: "Age", weight: "Weight (kg)", height: "Height (cm)", activity: "Activity", diet: "Diet",
  low: "Low", moderate: "Moderate", high: "High", omnivore: "Omnivore", vegetarian: "Vegetarian", vegan: "Vegan",
  muscle: "Muscle gain", fat_loss: "Fat loss", balance: "Balance", endurance: "Endurance",
  generate: "Generate my plan", generating: "Your coach is building your plan…", adjust: "Adjust my plan",
  protein: "Protein", carbs: "Carbs", fats: "Fats", meals: "Meals", tips: "Tips", perDay: "per day",
  progressTitle: "Progress", logWeight: "Log a measurement", bodyFat: "Body fat % (optional)", note: "Note (optional)",
  save: "Save", history: "History", noEntries: "No measurements yet", totalMin: "Total minutes", change: "Change",
  bookingTitle: "Book a session", sessionType: "Session type", gym: "KFIT Gym · Tulum", outdoor: "Beach & Jungle · Tulum",
  online: "Online video", pickDate: "Pick a date", pickTime: "Pick a time", confirm: "Confirm booking",
  myBookings: "My bookings", cancel: "Cancel", booked: "Session booked!", with: "with",
  language: "Language", logout: "Sign out", account: "Account", security: "Secured session · encrypted storage",
  checkEmailTitle: "Check your inbox", checkEmailBody: "We sent a confirmation link to", checkEmailHint: "Open it to activate your account, then come back and sign in.",
  backToLogin: "Back to sign in",
  authErr_invalid_credentials: "Incorrect email or password", authErr_email_not_confirmed: "Please confirm your email address first (check your inbox)",
  authErr_user_already_exists: "An account already exists with this email", authErr_weak_password: "This password is too weak — choose a longer, less common one",
  authErr_rate_limited: "Too many attempts. Please wait a few minutes and try again", authErr_unknown: "Something went wrong. Check your connection and try again",
  required: "Please fill all fields correctly", error: "Something went wrong", retry: "Retry",
};
type Dict = typeof en;

const es: Dict = {
  tagline: "ENTRENA MÁS INTELIGENTE. VIVE MÁS FUERTE.", by: "POR T7 CORP",
  welcomeTitle: "Tu coaching a medida en Tulum.",
  f1: "Programas personalizados", f2: "Nutrición inteligente (IA)", f3: "Sigue tu progreso", f4: "Coaching en línea y presencial",
  getStarted: "Comenzar", haveAccount: "Ya tengo una cuenta",
  login: "Iniciar sesión", register: "Crear cuenta", email: "Correo", password: "Contraseña", name: "Nombre",
  pwHint: "Mínimo 8 caracteres", google: "Continuar con Google", or: "o",
  noAccount: "¿Sin cuenta? Crea una", gotAccount: "¿Ya eres miembro? Inicia sesión",
  hello: "Hola", letsTrain: "Entrenemos inteligente.",
  workouts: "Entrenos", nutrition: "Nutrición", progress: "Progreso", coaching: "Coaching",
  yourProgram: "Tu programa", noProgram: "Elige un programa para empezar", browse: "Ver programas",
  nextWorkout: "Próximo entreno", done: "¡Programa completado!", minutes: "min", kcal: "kcal", kg: "kg",
  stats: "Tus estadísticas", nextSession: "Próxima sesión de coaching", none: "Ninguna reservada",
  home: "Inicio", training: "Entreno", coach: "Coach", profile: "Perfil",
  programs: "Programas", weeks: "semanas", sessions: "sesiones",
  beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado",
  enroll: "Empezar este programa", enrolled: "Programa actual", markDone: "Marcar como hecho", completed: "Completado",
  exercises: "Ejercicios", sets: "series",
  coachTitle: "Coach IA", coachIntro: "Pregúntame sobre entrenamiento, recuperación o nutrición.",
  typeMessage: "Escribe a tu coach…", clear: "Borrar",
  s1: "Crea un entreno de 20 min", s2: "¿Cómo recuperarme más rápido?", s3: "¿Mejor comida pre-entreno?", s4: "Motívame hoy",
  nutritionTitle: "Plan nutricional IA", goal: "Objetivo", sex: "Sexo", male: "Hombre", female: "Mujer",
  age: "Edad", weight: "Peso (kg)", height: "Altura (cm)", activity: "Actividad", diet: "Dieta",
  low: "Baja", moderate: "Moderada", high: "Alta", omnivore: "Omnívora", vegetarian: "Vegetariana", vegan: "Vegana",
  muscle: "Ganar músculo", fat_loss: "Perder grasa", balance: "Equilibrio", endurance: "Resistencia",
  generate: "Generar mi plan", generating: "Tu coach está creando tu plan…", adjust: "Ajustar mi plan",
  protein: "Proteína", carbs: "Carbohidratos", fats: "Grasas", meals: "Comidas", tips: "Consejos", perDay: "por día",
  progressTitle: "Progreso", logWeight: "Registrar medida", bodyFat: "% grasa (opcional)", note: "Nota (opcional)",
  save: "Guardar", history: "Historial", noEntries: "Sin medidas aún", totalMin: "Minutos totales", change: "Cambio",
  bookingTitle: "Reservar sesión", sessionType: "Tipo de sesión", gym: "KFIT Gym · Tulum", outdoor: "Playa y Selva · Tulum",
  online: "Video en línea", pickDate: "Elige una fecha", pickTime: "Elige una hora", confirm: "Confirmar reserva",
  myBookings: "Mis reservas", cancel: "Cancelar", booked: "¡Sesión reservada!", with: "con",
  language: "Idioma", logout: "Cerrar sesión", account: "Cuenta", security: "Sesión segura · almacenamiento cifrado",
  checkEmailTitle: "Revisa tu correo", checkEmailBody: "Enviamos un enlace de confirmación a", checkEmailHint: "Ábrelo para activar tu cuenta y luego vuelve para iniciar sesión.",
  backToLogin: "Volver a iniciar sesión",
  authErr_invalid_credentials: "Correo o contraseña incorrectos", authErr_email_not_confirmed: "Primero confirma tu correo (revisa tu bandeja de entrada)",
  authErr_user_already_exists: "Ya existe una cuenta con este correo", authErr_weak_password: "Contraseña demasiado débil: elige una más larga y menos común",
  authErr_rate_limited: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo", authErr_unknown: "Algo salió mal. Revisa tu conexión e inténtalo de nuevo",
  required: "Completa todos los campos correctamente", error: "Algo salió mal", retry: "Reintentar",
};

const fr: Dict = {
  tagline: "TRAIN SMARTER. LIVE STRONGER.", by: "BY T7 CORP",
  welcomeTitle: "Ton coaching sur-mesure à Tulum.",
  f1: "Programmes personnalisés", f2: "Nutrition intelligente (IA)", f3: "Suivi de tes progrès", f4: "Coaching en ligne et sur place",
  getStarted: "Commencer", haveAccount: "J'ai déjà un compte",
  login: "Se connecter", register: "Créer un compte", email: "Email", password: "Mot de passe", name: "Prénom",
  pwHint: "8 caractères minimum", google: "Continuer avec Google", or: "ou",
  noAccount: "Pas de compte ? Crées-en un", gotAccount: "Déjà membre ? Connecte-toi",
  hello: "Salut", letsTrain: "Entraînons-nous plus intelligemment.",
  workouts: "Séances", nutrition: "Nutrition", progress: "Progrès", coaching: "Coaching",
  yourProgram: "Ton programme", noProgram: "Choisis un programme pour commencer", browse: "Voir les programmes",
  nextWorkout: "Prochaine séance", done: "Programme terminé !", minutes: "min", kcal: "kcal", kg: "kg",
  stats: "Tes stats", nextSession: "Prochaine séance de coaching", none: "Aucune réservée",
  home: "Accueil", training: "Training", coach: "Coach", profile: "Profil",
  programs: "Programmes", weeks: "semaines", sessions: "séances",
  beginner: "Débutant", intermediate: "Intermédiaire", advanced: "Avancé",
  enroll: "Commencer ce programme", enrolled: "Programme actuel", markDone: "Marquer comme fait", completed: "Terminé",
  exercises: "Exercices", sets: "séries",
  coachTitle: "Coach IA", coachIntro: "Pose-moi tes questions sur l'entraînement, la récup ou la nutrition.",
  typeMessage: "Écris à ton coach…", clear: "Effacer",
  s1: "Crée-moi une séance de 20 min", s2: "Comment mieux récupérer ?", s3: "Meilleur repas pré-training ?", s4: "Motive-moi aujourd'hui",
  nutritionTitle: "Plan nutrition IA", goal: "Objectif", sex: "Sexe", male: "Homme", female: "Femme",
  age: "Âge", weight: "Poids (kg)", height: "Taille (cm)", activity: "Activité", diet: "Régime",
  low: "Faible", moderate: "Modérée", high: "Élevée", omnivore: "Omnivore", vegetarian: "Végétarien", vegan: "Végan",
  muscle: "Prise de muscle", fat_loss: "Perte de gras", balance: "Équilibre", endurance: "Endurance",
  generate: "Générer mon plan", generating: "Ton coach prépare ton plan…", adjust: "Ajuster mon plan",
  protein: "Protéines", carbs: "Glucides", fats: "Lipides", meals: "Repas", tips: "Conseils", perDay: "par jour",
  progressTitle: "Progrès", logWeight: "Ajouter une mesure", bodyFat: "% de masse grasse (optionnel)", note: "Note (optionnel)",
  save: "Enregistrer", history: "Historique", noEntries: "Aucune mesure pour l'instant", totalMin: "Minutes totales", change: "Évolution",
  bookingTitle: "Réserver une séance", sessionType: "Type de séance", gym: "KFIT Gym · Tulum", outdoor: "Plage & Jungle · Tulum",
  online: "Visio en ligne", pickDate: "Choisis une date", pickTime: "Choisis un horaire", confirm: "Confirmer la réservation",
  myBookings: "Mes réservations", cancel: "Annuler", booked: "Séance réservée !", with: "avec",
  language: "Langue", logout: "Se déconnecter", account: "Compte", security: "Session sécurisée · stockage chiffré",
  checkEmailTitle: "Vérifie ta boîte mail", checkEmailBody: "Nous avons envoyé un lien de confirmation à", checkEmailHint: "Ouvre-le pour activer ton compte, puis reviens te connecter.",
  backToLogin: "Retour à la connexion",
  authErr_invalid_credentials: "E-mail ou mot de passe incorrect", authErr_email_not_confirmed: "Confirme d'abord ton adresse e-mail (vérifie ta boîte mail)",
  authErr_user_already_exists: "Un compte existe déjà avec cet e-mail", authErr_weak_password: "Mot de passe trop faible : choisis-en un plus long et moins courant",
  authErr_rate_limited: "Trop de tentatives. Patiente quelques minutes puis réessaie", authErr_unknown: "Une erreur est survenue. Vérifie ta connexion et réessaie",
  required: "Remplis correctement tous les champs", error: "Une erreur est survenue", retry: "Réessayer",
};

const DICTS: Record<Lang, Dict> = { en, es, fr };
export type TKey = keyof Dict;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };
const I18nContext = createContext<Ctx>({ lang: "fr", setLang: () => {}, t: (k) => fr[k] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");
  useEffect(() => {
    storage.getItem("kfit_lang", "fr").then((l) => LANGS.includes(l as Lang) && setLangState(l as Lang));
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem("kfit_lang", l);
  }, []);
  const t = useCallback((k: TKey) => DICTS[lang][k] ?? en[k], [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

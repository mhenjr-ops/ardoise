import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'fr' | 'en';

const fr = {
  appName: 'Ardoise',
  signIn: 'Se connecter',
  signOut: 'Déconnexion',
  email: 'Adresse e-mail',
  password: 'Mot de passe',
  invalidLogin: 'E-mail ou mot de passe incorrect.',
  tagline: 'Vos cours, devoirs et notes, même avec peu de réseau.',
  notConfigured: 'Application non configurée : ajoutez EXPO_PUBLIC_SUPABASE_URL et la clé dans mobile/.env.',
  hello: 'Bonjour',
  myCourses: 'Mes cours',
  todo: 'À faire',
  nothingDue: 'Rien à rendre pour le moment.',
  noCourses: "Vous n'êtes inscrit à aucun cours. Donnez votre e-mail à la scolarité.",
  modules: 'Modules',
  announcements: 'Annonces',
  assignments: 'Devoirs',
  grades: 'Notes',
  noModules: 'Aucun module.',
  noAnnouncements: 'Aucune annonce.',
  noAssignments: 'Aucun devoir.',
  due: 'À rendre le',
  noDue: 'Pas de date limite',
  points: 'points',
  late: 'En retard',
  submitted: 'Rendu',
  notSubmitted: 'Pas encore rendu',
  instructions: 'Consignes',
  yourWork: 'Votre travail',
  writtenAnswer: 'Réponse écrite',
  takePhoto: 'Prendre une photo',
  choosePhoto: 'Choisir une photo',
  chooseFile: 'Choisir un fichier (PDF…)',
  removeFile: 'Retirer',
  submit: 'Rendre le travail',
  resubmit: 'Rendre une nouvelle version',
  sending: 'Envoi…',
  sent: 'Travail rendu.',
  emptySubmission: 'Ajoutez une réponse ou un fichier.',
  fileTooBig: 'Fichier trop volumineux (10 Mo maximum).',
  error: 'Une erreur est survenue. Vérifiez votre connexion et réessayez.',
  yourGrade: 'Votre note',
  feedback: "Commentaire de l'enseignant",
  average: 'Moyenne',
  weightNote: 'Pondérée par les coefficients, sur 20.',
  notGraded: 'Non noté',
  gradeOnWeb: 'La notation des copies se fait sur la version web.',
  newAnnouncement: 'Nouvelle annonce',
  title: 'Titre',
  message: 'Message',
  post: 'Publier',
  submittedOn: 'Rendu le',
  cameraDenied: "Autorisez l'appareil photo dans les réglages.",
  components: { cc: 'Contrôle continu', tp: 'Travaux pratiques', exam: 'Examen', resit: 'Rattrapage', other: 'Autre' },
  student: 'Étudiant',
  teaching: 'Enseignant',
  quiz: 'Quiz',
  startQuiz: 'Commencer le quiz',
  resumeQuiz: 'Reprendre le quiz',
  attemptsUsed: 'tentative(s) utilisée(s) sur',
  noAttemptsLeft: 'Plus de tentative disponible.',
  attempt: 'Tentative',
  timeLeft: 'Temps restant',
  saved: 'Enregistré',
  saving: 'Enregistrement…',
  offline: 'Hors ligne : nouvel essai automatique',
  submitQuiz: 'Rendre le quiz',
  confirmSubmit: 'Confirmer la remise',
  cancel: 'Annuler',
  answered: 'répondue(s) sur',
  score: 'Score',
  review: 'Correction',
  yourAnswer: 'Votre réponse',
  noAnswer: 'Sans réponse',
  expected: 'Réponse attendue',
  pendingReview: 'En attente de correction',
  timeUp: 'Temps écoulé : le quiz a été rendu.',
  trueLabel: 'Vrai',
  falseLabel: 'Faux',
  inProgress: 'En cours',
  keysHidden: 'La correction sera visible plus tard.',
  timeLimit: 'Durée',
  unlimited: 'Illimitée',
  minutes: 'min',
  myResults: 'Mes résultats',
  noResults: 'Aucun résultat publié pour le moment.',
  credits: 'Crédits',
  decision: 'Décision',
  decisions: { admitted: 'Admis', admitted_compensation: 'Admis par compensation', resit: 'Ajourné (rattrapage)', incomplete: 'Incomplet' },
  ueStatus: { validated: 'Validée', compensated: 'Compensée', failed: 'Non validée', incomplete: 'Incomplète' },
  openTranscript: 'Relevé de notes (PDF sur le web)',
};

type Dict = typeof fr;

const en: Dict = {
  appName: 'Ardoise',
  signIn: 'Sign in',
  signOut: 'Sign out',
  email: 'Email address',
  password: 'Password',
  invalidLogin: 'Wrong email or password.',
  tagline: 'Your courses, assignments and grades, even on a weak connection.',
  notConfigured: 'App not configured: add EXPO_PUBLIC_SUPABASE_URL and the key in mobile/.env.',
  hello: 'Hello',
  myCourses: 'My courses',
  todo: 'To do',
  nothingDue: 'Nothing due right now.',
  noCourses: "You're not enrolled in any course. Give your email to the registrar.",
  modules: 'Modules',
  announcements: 'Announcements',
  assignments: 'Assignments',
  grades: 'Grades',
  noModules: 'No modules.',
  noAnnouncements: 'No announcements.',
  noAssignments: 'No assignments.',
  due: 'Due',
  noDue: 'No due date',
  points: 'points',
  late: 'Late',
  submitted: 'Submitted',
  notSubmitted: 'Not submitted yet',
  instructions: 'Instructions',
  yourWork: 'Your work',
  writtenAnswer: 'Written answer',
  takePhoto: 'Take a photo',
  choosePhoto: 'Choose a photo',
  chooseFile: 'Choose a file (PDF…)',
  removeFile: 'Remove',
  submit: 'Submit work',
  resubmit: 'Submit a new version',
  sending: 'Sending…',
  sent: 'Work submitted.',
  emptySubmission: 'Add an answer or a file.',
  fileTooBig: 'File too large (10 MB max).',
  error: 'Something went wrong. Check your connection and try again.',
  yourGrade: 'Your grade',
  feedback: 'Teacher feedback',
  average: 'Average',
  weightNote: 'Weighted by each assignment, out of 20.',
  notGraded: 'Not graded',
  gradeOnWeb: 'Grading is done on the web version.',
  newAnnouncement: 'New announcement',
  title: 'Title',
  message: 'Message',
  post: 'Post',
  submittedOn: 'Submitted',
  cameraDenied: 'Allow camera access in Settings.',
  components: { cc: 'Continuous assessment', tp: 'Practical work', exam: 'Exam', resit: 'Resit', other: 'Other' },
  student: 'Student',
  teaching: 'Teaching',
  quiz: 'Quiz',
  startQuiz: 'Start quiz',
  resumeQuiz: 'Resume quiz',
  attemptsUsed: 'attempt(s) used of',
  noAttemptsLeft: 'No attempts left.',
  attempt: 'Attempt',
  timeLeft: 'Time left',
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline: retrying automatically',
  submitQuiz: 'Submit quiz',
  confirmSubmit: 'Confirm submission',
  cancel: 'Cancel',
  answered: 'answered of',
  score: 'Score',
  review: 'Review',
  yourAnswer: 'Your answer',
  noAnswer: 'No answer',
  expected: 'Expected answer',
  pendingReview: 'Waiting for marking',
  timeUp: 'Time is up: the quiz was submitted.',
  trueLabel: 'True',
  falseLabel: 'False',
  inProgress: 'In progress',
  keysHidden: 'Answers will be shown later.',
  timeLimit: 'Time limit',
  unlimited: 'Unlimited',
  minutes: 'min',
  myResults: 'My results',
  noResults: 'No published results yet.',
  credits: 'Credits',
  decision: 'Decision',
  decisions: { admitted: 'Passed', admitted_compensation: 'Passed by compensation', resit: 'Deferred (resit)', incomplete: 'Incomplete' },
  ueStatus: { validated: 'Validated', compensated: 'Compensated', failed: 'Not validated', incomplete: 'Incomplete' },
  openTranscript: 'Transcript (PDF on the web)',
};

const dictionaries: Record<Locale, Dict> = { fr, en };
const STORAGE_KEY = 'ardoise_locale';

function deviceLocale(): Locale {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('en') ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

type I18nValue = { locale: Locale; t: Dict; setLocale: (l: Locale) => void };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'fr' || saved === 'en') setLocaleState(saved);
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const value = useMemo(() => ({ locale, t: dictionaries[locale], setLocale }), [locale, setLocale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function formatDateTime(locale: Locale, iso: string | null | undefined) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Douala',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatScore(locale: Locale, value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const rounded = Math.round(Number(value) * 100) / 100;
  return locale === 'fr' ? String(rounded).replace('.', ',') : String(rounded);
}

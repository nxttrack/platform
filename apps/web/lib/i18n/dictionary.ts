import { defaultLanguage, normalizeSupportedLanguage, type SupportedLanguage } from "./languages";

export const dictionary = {
  nl: {
    common: {
      dashboard: "Dashboard",
      login: "Inloggen",
      save: "Opslaan",
      cancel: "Annuleren",
      loading: "Laden",
      empty: "Nog geen gegevens gevonden.",
      error: "Er ging iets mis. Probeer het opnieuw."
    },
    publicTenant: {
      programs: "Programma's",
      intake: "Intake",
      agenda: "Agenda",
      news: "Nieuws",
      startIntake: "Start intake",
      viewPrograms: "Bekijk programma's",
      submitted: "Bedankt, je aanmelding is ontvangen."
    },
    parentPortal: {
      lessons: "Mijn lessen",
      notifications: "Notificaties",
      documents: "Documenten",
      payments: "Betalingen",
      progress: "Voortgang"
    },
    communication: {
      email: "E-mail",
      internalMessage: "Intern bericht",
      template: "Template",
      send: "Versturen"
    },
    knowledgeBase: {
      articles: "Helpartikelen",
      search: "Zoeken",
      contactSupport: "Neem contact op"
    }
  },
  en: {
    common: {
      dashboard: "Dashboard",
      login: "Log in",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading",
      empty: "No records found yet.",
      error: "Something went wrong. Please try again."
    },
    publicTenant: {
      programs: "Programs",
      intake: "Intake",
      agenda: "Agenda",
      news: "News",
      startIntake: "Start intake",
      viewPrograms: "View programs",
      submitted: "Thank you, your registration has been received."
    },
    parentPortal: {
      lessons: "My lessons",
      notifications: "Notifications",
      documents: "Documents",
      payments: "Payments",
      progress: "Progress"
    },
    communication: {
      email: "Email",
      internalMessage: "Internal message",
      template: "Template",
      send: "Send"
    },
    knowledgeBase: {
      articles: "Help articles",
      search: "Search",
      contactSupport: "Contact support"
    }
  }
} as const;

type TranslationTree = (typeof dictionary)[typeof defaultLanguage];
type TranslationNamespace = keyof TranslationTree;

export type TranslationKey = {
  [Namespace in TranslationNamespace]: `${Namespace & string}.${Extract<keyof TranslationTree[Namespace], string>}`;
}[TranslationNamespace];

export type TranslationParams = Record<string, string | number>;

export function translate(language: string | null | undefined, key: TranslationKey, params?: TranslationParams) {
  const resolvedLanguage = normalizeSupportedLanguage(language, defaultLanguage);
  const template = getTranslationValue(resolvedLanguage, key) ?? getTranslationValue(defaultLanguage, key) ?? key;

  return interpolate(template, params);
}

function getTranslationValue(language: SupportedLanguage, key: TranslationKey): string | null {
  const [namespace, itemKey] = key.split(".") as [TranslationNamespace, string];
  const values = dictionary[language][namespace] as Record<string, string>;

  return values[itemKey] ?? null;
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, variable: string) => {
    const value = params[variable];

    return value === undefined ? match : String(value);
  });
}

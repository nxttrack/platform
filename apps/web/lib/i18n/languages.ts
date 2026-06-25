export const supportedLanguages = ["nl", "en"] as const;

export const futureLanguages = ["pl", "tr", "ar", "uk"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];
export type FutureLanguage = (typeof futureLanguages)[number];
export type LanguageCode = SupportedLanguage | FutureLanguage;

export const defaultLanguage: SupportedLanguage = "nl";

export type TenantLanguageSettings = {
  defaultLanguage: SupportedLanguage;
  enabledLanguages: SupportedLanguage[];
};

export type LanguagePreferenceInput = {
  userPreferredLanguage?: string | null;
  guardianPreferredLanguage?: string | null;
  tenantDefaultLanguage?: string | null;
};

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

export function isKnownLanguage(value: string | null | undefined): value is LanguageCode {
  return isSupportedLanguage(value) || futureLanguages.includes(value as FutureLanguage);
}

export function normalizeSupportedLanguage(value: string | null | undefined, fallback: SupportedLanguage = defaultLanguage): SupportedLanguage {
  return isSupportedLanguage(value) ? value : fallback;
}

export function resolveLanguagePreference(input: LanguagePreferenceInput): SupportedLanguage {
  return normalizeSupportedLanguage(input.userPreferredLanguage ?? input.guardianPreferredLanguage ?? input.tenantDefaultLanguage, defaultLanguage);
}

export function normalizeTenantLanguageSettings(input?: Partial<TenantLanguageSettings> | null): TenantLanguageSettings {
  const enabledLanguages = uniqueSupportedLanguages(input?.enabledLanguages?.length ? input.enabledLanguages : [defaultLanguage]);
  const defaultTenantLanguage = normalizeSupportedLanguage(input?.defaultLanguage, defaultLanguage);

  return {
    defaultLanguage: enabledLanguages.includes(defaultTenantLanguage) ? defaultTenantLanguage : (enabledLanguages[0] ?? defaultLanguage),
    enabledLanguages
  };
}

function uniqueSupportedLanguages(values: Array<string | null | undefined>) {
  const languages = values.filter(isSupportedLanguage);
  const uniqueLanguages = [...new Set(languages)];

  return uniqueLanguages.length > 0 ? uniqueLanguages : [defaultLanguage];
}

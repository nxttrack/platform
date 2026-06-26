import { defaultLanguage, isSupportedLanguage, type SupportedLanguage } from "./languages";

export type PublicRouteKey = "home" | "news" | "agenda" | "programs" | "programDetail" | "intake" | "login";

export type PublicRouteParams = {
  slug?: string | null;
  program?: string | null;
  submitted?: boolean;
  submission?: string | null;
};

export function publicLanguageFromSegment(segment: string | null | undefined): SupportedLanguage | null {
  return isSupportedLanguage(segment) ? segment : null;
}

export function publicHref(language: SupportedLanguage, route: PublicRouteKey, params: PublicRouteParams = {}) {
  const path = publicPath(language, route, params);

  return withQuery(path, {
    program: params.program ?? undefined,
    submitted: params.submitted ? "1" : undefined,
    submission: params.submission ?? undefined
  });
}

function publicPath(language: SupportedLanguage, route: PublicRouteKey, params: PublicRouteParams) {
  const prefix = language === defaultLanguage ? "" : `/${language}`;

  if (route === "home") {
    return prefix || "/";
  }

  if (route === "news") {
    return language === defaultLanguage ? "/nieuws" : `${prefix}/news`;
  }

  if (route === "agenda") {
    return `${prefix}/agenda`;
  }

  if (route === "programs") {
    return language === defaultLanguage ? "/programmas" : `${prefix}/programs`;
  }

  if (route === "programDetail") {
    const base = language === defaultLanguage ? "/programmas" : `${prefix}/programs`;

    return `${base}/${encodeURIComponent(params.slug ?? "")}`;
  }

  if (route === "intake") {
    return `${prefix}/intake`;
  }

  return "/login";
}

function withQuery(path: string, query: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      search.set(key, value);
    }
  }

  const queryString = search.toString();

  return queryString ? `${path}?${queryString}` : path;
}

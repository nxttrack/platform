import { Award } from "lucide-react";
import { BadgeArtworkPlaceholder } from "@/components/badges/badge-artwork-placeholder";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ChildBadgesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params]: [Awaited<ReturnType<typeof getChildPortalData>>, Record<string, string | string[] | undefined>] = await Promise.all([getChildPortalData(), searchParams ?? Promise.resolve({})]);
  const requestedBadge = Array.isArray(params.badge) ? params.badge[0] : params.badge;
  const selectedBadge = requestedBadge ? data.badges.find((badge) => badge.id === requestedBadge) ?? null : null;
  if (requestedBadge && !selectedBadge) notFound();
  const celebrate = Boolean(data.preferences.celebrationsEnabled && selectedBadge?.earned && (Array.isArray(params.vier) ? params.vier[0] : params.vier) === "1");
  const requestedState = getParam(params, "status");
  const state = requestedState === "earned" || requestedState === "locked" ? requestedState : "all";
  const availableCategories = [...new Set(data.badges.map((badge) => badge.category))];
  const requestedCategory = getParam(params, "categorie");
  const category = requestedCategory && availableCategories.includes(requestedCategory) ? requestedCategory : "all";
  const filteredBadges = data.badges.filter((badge) =>
    (state === "all" || (state === "earned") === badge.earned)
    && (category === "all" || badge.category === category)
  );
  const categories = groupByCategory(filteredBadges);
  return <div className="child-page" data-child-route-state="badges">
    <header className="child-page__heading"><span>Mijn badges</span><h1>Jouw hele badgewall</h1><p>Bekijk wat je al verdiend hebt en welke bekende uitdagingen nog op je wachten.</p></header>
    <nav aria-label="Badgefilters" className="child-badge-filters">
      {["all", "earned", "locked"].map((value) => <Link aria-current={state === value ? "page" : undefined} href={badgeFilterHref(value, category)} key={value}>{value === "all" ? "Alles" : value === "earned" ? "Verdiend" : "Nog te halen"}</Link>)}
      {availableCategories.map((value) => <Link aria-current={category === value ? "page" : undefined} href={badgeFilterHref(state, value)} key={value}>{categoryLabel(value)}</Link>)}
    </nav>
    {categories.length ? categories.map(([category, badges]) => <section className="child-card child-badge-category" key={category}>
      <header><span><Award aria-hidden="true" /></span><div><h2>{categoryLabel(category)}</h2><p>{badges.length} {badges.length === 1 ? "badge" : "badges"}</p></div></header>
      <div className="child-badge-grid">
        {badges.map((badge) => <Link data-state={badge.earned ? "earned" : "locked"} href={`/kind/badges?badge=${encodeURIComponent(badge.id)}${badge.earned ? "&vier=1" : ""}`} key={badge.id}>
          <BadgeArtworkPlaceholder earned={badge.earned} />
          <strong>{badge.title}</strong>
          <small>{badge.earned && badge.earnedAt ? `Behaald op ${formatDate(badge.earnedAt)}` : "Nog te halen"}</small>
        </Link>)}
      </div>
    </section>) : <section className="child-card child-empty"><Award /><h2>Je eerste badge komt eraan</h2><p>Blijf lekker oefenen. Onbehaalde verrassingen laten we natuurlijk nog niet zien.</p></section>}
    {selectedBadge ? <section aria-live={celebrate ? "polite" : undefined} className="child-card child-badge-detail" data-celebration={celebrate ? "open" : "closed"}><BadgeArtworkPlaceholder earned={selectedBadge.earned} /><div><small>{celebrate ? "Goed gedaan!" : selectedBadge.earned ? "Behaalde badge" : "Bekende uitdaging"}</small><h2>{selectedBadge.title}</h2><p>{selectedBadge.earned && selectedBadge.earnedAt ? `Behaald op ${formatDate(selectedBadge.earnedAt)}. Dit viermoment blijft veilig in de app en heeft geen deel- of downloadknop.` : "Deze standaardbadge heb je nog niet verdiend. Verrassingsbadges blijven tot het echte unlockmoment volledig geheim."}</p></div></section> : null}
  </div>;
}

function groupByCategory<T extends { category: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
  return [...grouped.entries()];
}
function categoryLabel(value: string) {
  const labels: Record<string, string> = { start: "De start", skills: "Vaardigheden", courage: "Moed & vertrouwen", compliments: "Complimenten", specials: "Bijzondere momenten", stages: "Niveaus", diplomas: "Eindresultaten", attendance: "Doorzetten", technique: "Techniek", makeup: "Extra momenten" };
  return labels[value] ?? "Mijn mijlpalen";
}
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)); }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function badgeFilterHref(status: string, category: string) { const query = new URLSearchParams(); if (status !== "all") query.set("status", status); if (category !== "all") query.set("categorie", category); const value = query.toString(); return value ? `/kind/badges?${value}` : "/kind/badges"; }

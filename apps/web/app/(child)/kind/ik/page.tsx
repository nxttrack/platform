import { Image as ImageIcon, Settings, Sparkles, Tag } from "lucide-react";
import Link from "next/link";

import { createChildParentRequestAction, saveChildPreferencesAction } from "@/lib/domain/child-portal-actions";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { returnToParentPortalAction } from "@/lib/auth/portal-session-actions";

export const dynamic = "force-dynamic";

const tabs = ["prijzenkast", "momenten", "instellingen"] as const;
type Tab = (typeof tabs)[number];

export default async function ChildMePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params]: [Awaited<ReturnType<typeof getChildPortalData>>, Record<string, string | string[] | undefined>] = await Promise.all([
    getChildPortalData(),
    searchParams ?? Promise.resolve({})
  ]);
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const active: Tab = tabs.includes(requested as Tab) ? requested as Tab : "momenten";
  const requestStatus = Array.isArray(params.verzoek) ? params.verzoek[0] : params.verzoek;
  const preferencesStatus = Array.isArray(params.voorkeuren) ? params.voorkeuren[0] : params.voorkeuren;
  return <div className="child-page" data-child-route-state={`profile-${active}`}>
    <header className="child-page__heading child-profile-heading"><span className="child-profile-avatar">{data.child.initial}</span><div><span>Dit ben ik</span><h1>{data.child.firstName}</h1><p>{data.program ? `${data.program.name} · ${data.program.stageName}` : "Mijn avontuur"}</p></div></header>
    <form action={returnToParentPortalAction} className="child-profile-exit"><button type="submit">Naar ouderportaal</button></form>
    <nav aria-label="Mijn profiel" className="child-tabs">
      <Link aria-current={active === "prijzenkast" ? "page" : undefined} href="/kind/ik?tab=prijzenkast"><Tag /> Prijzenkast</Link>
      <Link aria-current={active === "momenten" ? "page" : undefined} href="/kind/ik?tab=momenten"><Sparkles /> Momenten</Link>
      <Link aria-current={active === "instellingen" ? "page" : undefined} href="/kind/ik?tab=instellingen"><Settings /> Instellingen</Link>
    </nav>
    {active === "prijzenkast" ? <section className="child-card"><h2>Mijn prijzenkast</h2>{data.certificates.length ? <div className="child-trophy-grid">{data.certificates.map((certificate) => <article key={certificate.id}><Tag aria-hidden="true" /><div><strong>{certificate.title}</strong><small>Behaald op {formatDate(certificate.issuedOn)}</small></div></article>)}</div> : <div className="child-empty"><Tag /><h2>Jouw prijzenkast groeit met je mee</h2><p>Hier komen behaalde diploma- en mijlpaalgegevens, zonder privédocumenten of serienummers. Een ouder regelt documenten en betalingen in het ouderportaal.</p></div>}</section> : null}
    {active === "momenten" ? <section className="child-card"><h2>Mijn mooie momenten</h2>{data.media.length ? <div className="child-moment-grid">{data.media.map((media) => <figure key={media.id}>{media.type === "video" ? <video aria-label={media.caption ?? "Een goedgekeurd moment"} controls playsInline preload="metadata" src={media.viewUrl} /> : <img alt={media.caption ?? "Een goedgekeurd moment"} src={media.viewUrl} />}<figcaption>{media.caption ?? "Een mooi moment"}</figcaption></figure>)}</div> : <div className="child-empty"><ImageIcon /><h2>Nog geen momenten gedeeld</h2><p>Alleen foto’s en korte video’s die een ouder speciaal voor kindmodus goedkeurt verschijnen hier.</p></div>}</section> : null}
    {active === "instellingen" ? <div className="child-settings-grid">
      {preferencesStatus === "opgeslagen" ? <p className="child-safe-feedback" role="status">Je instellingen zijn opgeslagen.</p> : null}
      {requestStatus ? <p className="child-safe-feedback" data-tone={requestStatus === "verstuurd" ? "success" : "warning"} role="status">{requestStatus === "verstuurd" ? "Je verzoek staat veilig klaar voor je ouder." : requestStatus === "limiet" ? "Je hebt kort geleden al drie verzoeken gestuurd. Probeer het later opnieuw." : "Je verzoek kon nu niet worden verstuurd."}</p> : null}
      <form action={saveChildPreferencesAction} className="child-card child-settings-form"><h2>Zo voelt mijn app fijn</h2><label><input defaultChecked={data.preferences.celebrationsEnabled} name="celebrationsEnabled" type="checkbox" /> Vier mijn behaalde momenten</label><label><input defaultChecked={data.preferences.soundEnabled} name="soundEnabled" type="checkbox" /> Geluid bij een viermoment</label><label><input defaultChecked={data.preferences.readAloudEnabled} name="readAloudEnabled" type="checkbox" /> Toon de knop Lees voor als mijn apparaat dit ondersteunt</label><label><input defaultChecked={data.preferences.reducedMotion} name="reducedMotion" type="checkbox" /> Minder beweging op het scherm</label>{data.availableThemes.length ? <label><span>Mijn thema</span><select defaultValue={data.preferences.themeKey && data.preferences.themeRelease ? `${data.preferences.themeKey}@${data.preferences.themeRelease}` : "tenant-default"} name="themeRelease"><option value="tenant-default">Thema van mijn organisatie</option>{data.availableThemes.map((theme) => <option key={`${theme.key}@${theme.release}`} value={`${theme.key}@${theme.release}`}>{theme.name}</option>)}</select></label> : null}<button type="submit">Opslaan</button></form>
      {data.features["swim.portal.parent_requests"] ? <form action={createChildParentRequestAction} className="child-card child-request-form" id="vraag-ouder"><h2>Vraag mijn ouder</h2><p>Dit vraagt alleen om het ouderportaal samen te openen. Er wordt geen andere actie uitgevoerd.</p><input name="requestType" type="hidden" value="open_parent_portal" /><button type="submit">Vraag ouderportaal te openen</button></form> : null}
    </div> : null}
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

"use client";

import { useState } from "react";
import { parseJourneyPresentation, type PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";

const field = "w-full rounded-lg border bg-background p-2 text-sm";

export function ThemeSupportEditor({ presentation, disabled, onChange }: { presentation: PortalJourneyPresentationV1; disabled: boolean; onChange: (value: PortalJourneyPresentationV1) => void }) {
  const [slot, setSlot] = useState(""), [asset, setAsset] = useState(""), [item, setItem] = useState({ id: "", title: "", assetId: "" }), [error, setError] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  function update(next: PortalJourneyPresentationV1) {
    try { onChange(parseJourneyPresentation(next)); setError(""); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Controleer de afbeelding en identiteit"); return false; }
  }
  const choices = Object.keys(presentation.assets).map((id) => <option key={id}>{id}</option>);
  return <fieldset disabled={disabled} className="space-y-5 rounded-2xl border bg-card p-5"><legend className="px-2 text-xl font-bold">Ondersteunende beelden en verzameling</legend>
    <p>Ondersteunende beelden horen bij een scherm of moment. Ze worden niet gebruikt als onderdeelillustratie. Vondsten staan los van beoordelingen en diploma’s.</p>
    {error ? <p role="alert" className="text-danger">{error}</p> : null}
    <div className="space-y-3"><h3 className="font-bold">Beeldkoppelingen</h3>
      {Object.entries(presentation.supportSlots).map(([id, value]) => <div key={id} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1">{id}<select className={field} value={value} onChange={(event) => update({ ...presentation, supportSlots: { ...presentation.supportSlots, [id]: event.target.value } })}>{choices}</select></label><button type="button" aria-label={`Beeldkoppeling ${id} verwijderen`} className="rounded-lg border p-2" onClick={() => { const next = { ...presentation.supportSlots }; delete next[id]; update({ ...presentation, supportSlots: next }); }}>Verwijderen</button></div>)}
      <div className="grid gap-3 sm:grid-cols-2"><label>Nieuwe beeldkoppeling<input className={field} value={slot} maxLength={100} onChange={(event) => setSlot(event.target.value)} placeholder="Bijvoorbeeld moment.celebration" /></label><label>Afbeelding voor beeldkoppeling<select className={field} value={asset} onChange={(event) => setAsset(event.target.value)}><option value="">Kies een afbeelding</option>{choices}</select></label></div>
      <button type="button" className="rounded-lg border p-3" disabled={!slot || !asset || Object.hasOwn(presentation.supportSlots, slot)} onClick={() => { if (update({ ...presentation, supportSlots: { ...presentation.supportSlots, [slot]: asset } })) { setSlot(""); setAsset(""); } }}>Beeldkoppeling toevoegen</button>
    </div>
    <div className="space-y-3"><h3 className="font-bold">Vondsten in dit thema</h3><p className="text-sm">Een bestaande identiteit blijft dezelfde vondst in volgende versies. Verwijderen uit dit concept verwijdert geen eerder bewaarde vondsten.</p>
      {presentation.collectibles.pool.map((entry) => <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2" key={entry.id}><strong className="break-all sm:col-span-2">{entry.id}</strong><label>Titel van {entry.id}<input className={field} value={titles[entry.id] ?? entry.title} maxLength={100} onChange={(event) => setTitles({ ...titles, [entry.id]: event.target.value })} /></label><label>Afbeelding van {entry.id}<select className={field} value={entry.assetId ?? ""} onChange={(event) => update({ ...presentation, collectibles: { routeBinding: "none", pool: presentation.collectibles.pool.map((value) => value.id === entry.id ? { ...value, assetId: event.target.value || null } : value) } })}><option value="">Geen afbeelding</option>{choices}</select></label><button type="button" className="rounded-lg border p-2" disabled={!titles[entry.id]?.trim() || titles[entry.id] === entry.title} onClick={() => update({ ...presentation, collectibles: { routeBinding: "none", pool: presentation.collectibles.pool.map((value) => value.id === entry.id ? { ...value, title: titles[entry.id].trim() } : value) } })}>Titel {entry.id} toepassen</button><button type="button" className="rounded-lg border p-2" onClick={() => { if (window.confirm(`Verwijder ${entry.title} uit dit concept? Eerdere vondsten blijven bewaard.`)) update({ ...presentation, collectibles: { routeBinding: "none", pool: presentation.collectibles.pool.filter((value) => value.id !== entry.id) } }); }}>Vondst {entry.id} verwijderen</button></div>)}
      <div className="grid gap-3 sm:grid-cols-3"><label>Nieuwe vondst-ID<input className={field} value={item.id} maxLength={100} onChange={(event) => setItem({ ...item, id: event.target.value })} /></label><label>Titel van nieuwe vondst<input className={field} value={item.title} maxLength={100} onChange={(event) => setItem({ ...item, title: event.target.value })} /></label><label>Afbeelding van nieuwe vondst<select className={field} value={item.assetId} onChange={(event) => setItem({ ...item, assetId: event.target.value })}><option value="">Geen afbeelding</option>{choices}</select></label></div>
      <button type="button" className="rounded-lg border p-3" disabled={!item.id || !item.title.trim()} onClick={() => { if (update({ ...presentation, collectibles: { routeBinding: "none", pool: [...presentation.collectibles.pool, { ...item, assetId: item.assetId || null }] } })) setItem({ id: "", title: "", assetId: "" }); }}>Vondst aan concept toevoegen</button>
    </div>
  </fieldset>;
}

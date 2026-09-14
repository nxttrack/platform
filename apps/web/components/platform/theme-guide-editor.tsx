"use client";
import { useState } from "react";
import type { JourneyGuide, PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";

const field = "w-full rounded-lg border bg-background p-2";
export function ThemeGuideEditor({ presentation, disabled, onChange }: { presentation: PortalJourneyPresentationV1; disabled: boolean; onChange: (guide: JourneyGuide) => void }) {
  const [mode, setMode] = useState(presentation.guide.mode), [poses, setPoses] = useState<Partial<Record<"idle" | "travel" | "look" | "celebrate", string>>>(presentation.guide.mode === "character" ? presentation.guide.poses : {});
  const [widthDesktop, setDesktop] = useState(presentation.guide.mode === "character" ? presentation.guide.widthDesktop : 170), [widthMobile, setMobile] = useState(presentation.guide.mode === "character" ? presentation.guide.widthMobile : 140);
  const [light, setLight] = useState(presentation.guide.mode === "route-light" ? { pulse: presentation.guide.pulse, halo: presentation.guide.halo, routeGlow: presentation.guide.routeGlow } : { pulse: true, halo: true, routeGlow: true });
  function apply() {
    if (mode === "character") {
      const idle = poses.idle && presentation.assets[poses.idle]; if (!idle) return;
      onChange({ mode, poses, widthDesktop, widthMobile, aspectRatio: idle.width / idle.height });
    } else onChange(mode === "none" ? { mode } : { mode, ...light });
  }
  return <fieldset disabled={disabled} className="grid gap-3 rounded-xl border p-4"><legend className="px-2 font-bold">Gids en poses</legend>
    <label>Type gids<select className={field} value={mode} onChange={(event) => setMode(event.target.value as JourneyGuide["mode"])}><option value="none">Geen gids</option><option value="route-light">Licht langs de route</option>{presentation.themeId !== "nxttrack-default" ? <option value="character">Karakter</option> : null}</select></label>
    {mode === "character" ? <><div className="grid gap-3 sm:grid-cols-2">{(["idle", "travel", "look", "celebrate"] as const).map((pose) => <label key={pose}>{{ idle: "Rustpose", travel: "Beweegpose", look: "Kijkpose", celebrate: "Vierpose" }[pose]}<select className={field} value={poses[pose] ?? ""} onChange={(event) => { const next = { ...poses }; if (event.target.value) next[pose] = event.target.value; else delete next[pose]; setPoses(next); }}><option value="">{pose === "idle" ? "Kies een rustpose" : "Gebruik de rustpose"}</option>{Object.keys(presentation.assets).map((id) => <option key={id}>{id}</option>)}</select></label>)}</div>
      <label>Breedte op desktop<input className={field} type="number" min={40} max={320} value={widthDesktop} onChange={(event) => setDesktop(Number(event.target.value))} /></label><label>Breedte op mobiel<input className={field} type="number" min={40} max={320} value={widthMobile} onChange={(event) => setMobile(Number(event.target.value))} /></label></> : mode === "route-light" ? <div className="grid gap-2">{(["pulse", "halo", "routeGlow"] as const).map((key) => <label key={key}><input type="checkbox" checked={light[key]} onChange={(event) => setLight({ ...light, [key]: event.target.checked })} /> {{ pulse: "Zachte puls", halo: "Lichtring", routeGlow: "Routegloed" }[key]}</label>)}</div> : null}
    <button type="button" className="rounded-lg border p-3" disabled={mode === "character" && !poses.idle} onClick={apply}>Gidsinstellingen toepassen</button>
    <p className="text-sm">Deze instellingen blijven onderdeel van het concept tot je opslaat. Minder beweging in het portaal blijft voorrang houden.</p>
  </fieldset>;
}

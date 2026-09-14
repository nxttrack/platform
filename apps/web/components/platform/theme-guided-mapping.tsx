"use client";
import { useActionState, useState } from "react";
import type { GuidedThemeAnalysis } from "@/lib/theme/theme-package-adapters";
import { saveGuidedThemeMappingAction } from "@/lib/domain/portal-theme-library-actions";

type Scene = { back: string | null; mid: string | null; front: string | null; anchors: [number, number][] };
type World = { id: string; name: string; landscape: Scene; portrait: Scene };
const empty = (): Scene => ({ back: null, mid: null, front: null, anchors: [] });
const newWorld = (n: number): World => ({ id: `world-${n}`, name: `Wereld ${n}`, landscape: empty(), portrait: empty() });
const field = "rounded-lg border bg-background p-2";
export function ThemeGuidedMapping({ id, analysis }: { id: string; analysis: GuidedThemeAnalysis }) {
  const [state, action, pending] = useActionState(saveGuidedThemeMappingAction, {});
  const [name, setName] = useState(""), [key, setKey] = useState(""), [release, setRelease] = useState("1.0.0");
  const [worlds, setWorlds] = useState<World[]>([newWorld(1)]), [active, setActive] = useState(0), [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const world = worlds[active], scene = world[orientation], image = analysis.images.find((entry) => entry.path === scene.back);
  function updateWorld(patch: Partial<World>) { setWorlds((previous) => previous.map((row, index) => index === active ? { ...row, ...patch } : row)); }
  function updateScene(patch: Partial<Scene>) { updateWorld({ [orientation]: { ...scene, ...patch } }); }
  const complete = worlds.every((entry) => [entry.landscape, entry.portrait].every((item) => item.back && item.anchors.length >= 2));
  return <form onReset={(event) => event.preventDefault()} action={action} className="grid gap-4">
    <input type="hidden" name="importId" value={id} /><input type="hidden" name="mapping" value={JSON.stringify({ themeId: key, name, release, worlds })} />
    <div className="grid gap-3 sm:grid-cols-3"><label>Naam<input className={`${field} w-full`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label><label>Thema-ID<input className={`${field} w-full`} value={key} onChange={(e) => setKey(e.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" required maxLength={64} /></label><label>Release<input className={`${field} w-full`} value={release} onChange={(e) => setRelease(e.target.value)} pattern="\d+\.\d+\.\d+" required /></label></div>
    <div className="flex flex-wrap gap-2">{worlds.map((entry, index) => <button key={index} type="button" className={field} aria-pressed={index === active} onClick={() => setActive(index)}>{entry.name || `Wereld ${index + 1}`}</button>)}<button type="button" className={field} disabled={worlds.length >= 30} onClick={() => { setWorlds([...worlds, newWorld(worlds.length + 1)]); setActive(worlds.length); }}>Wereld toevoegen</button></div>
    <div className="grid gap-3 sm:grid-cols-2"><label>Wereldnaam<input className={`${field} w-full`} value={world.name} onChange={(e) => updateWorld({ name: e.target.value })} required /></label><label>Stabiele wereld-ID<input className={`${field} w-full`} value={world.id} onChange={(e) => updateWorld({ id: e.target.value })} required /></label></div>
    <div className="flex flex-wrap gap-2"><button type="button" className={field} aria-pressed={orientation === "landscape"} onClick={() => setOrientation("landscape")}>Liggend</button><button type="button" className={field} aria-pressed={orientation === "portrait"} onClick={() => setOrientation("portrait")}>Staand</button></div>
    <div className="grid gap-3 sm:grid-cols-3">{(["back", "mid", "front"] as const).map((slot) => <label key={slot}>{({ back: "Achtergrond", mid: "Middenlaag", front: "Voorgrond" })[slot]}<select className={`${field} w-full`} value={scene[slot] ?? ""} onChange={(e) => updateScene({ [slot]: e.target.value || null })}><option value="">{slot === "back" ? "Kies achtergrond" : "Geen laag"}</option>{analysis.images.map((entry) => <option key={entry.path} value={entry.path}>{entry.path} · {entry.width} × {entry.height}</option>)}</select></label>)}</div>
    <p>Plaats minimaal twee routepunten in de gekozen volgorde. Je kunt de coördinaten ook met het toetsenbord invullen. Beide oriëntaties krijgen een eigen compositie.</p>
    {image ? <div className="relative mx-auto w-full max-w-2xl cursor-crosshair touch-manipulation" onClick={(event) => { if (scene.anchors.length >= 100) return; const rect = event.currentTarget.getBoundingClientRect(); updateScene({ anchors: [...scene.anchors, [Math.round((event.clientX - rect.left) / rect.width * 1000) / 10, Math.round((event.clientY - rect.top) / rect.height * 1000) / 10]] }); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/platform/themes/import/${id}/image?hash=${image.hash}`} alt={`${world.name}, ${orientation === "portrait" ? "staande" : "liggende"} compositie`} width={image.width} height={image.height} className="block h-auto w-full" draggable={false} />
      {scene.anchors.map(([x, y], index) => <span key={index} className="pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-blue-700 text-xs font-bold text-white" style={{ left: `${x}%`, top: `${y}%` }}>{index + 1}</span>)}
    </div> : null}
    <ol className="grid gap-2">{scene.anchors.map(([x, y], index) => <li key={index} className="flex flex-wrap items-center gap-3"><span>Punt {index + 1}</span>{([0, 1] as const).map((axis) => <label key={axis}>{axis === 0 ? "X" : "Y"} %<input type="number" className={`${field} ml-2 w-24`} min={0} max={100} step={0.1} value={axis === 0 ? x : y} onChange={(event) => { const points = structuredClone(scene.anchors); points[index][axis] = Number(event.target.value); updateScene({ anchors: points }); }} /></label>)}<button type="button" className={field} onClick={() => updateScene({ anchors: scene.anchors.filter((_, i) => i !== index) })}>Punt verwijderen</button></li>)}</ol>
    <button className={field} type="button" disabled={scene.anchors.length >= 100} onClick={() => updateScene({ anchors: [...scene.anchors, [50, 50]] })}>Routepunt invoeren</button>
    {state.error ? <p role="alert" className="text-danger">{state.error}</p> : null}<button className="rounded-xl bg-primary p-3 font-bold text-primary-foreground" disabled={pending || !complete}>Koppeling analyseren en preview openen</button>
  </form>;
}

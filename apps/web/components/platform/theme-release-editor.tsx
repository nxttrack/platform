"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ThemeAssetUpload } from "./theme-asset-upload";
import { ThemeGuideEditor } from "./theme-guide-editor";
import { ThemeSupportEditor } from "./theme-support-editor";
import { ThemeTokenEditor } from "./theme-token-editor";
import { matchesThemeDocument } from "@/lib/theme/theme-document-equality";
import { copyThemeVersionAction, updateThemeLibraryAction } from "@/lib/domain/portal-theme-library-actions";
import { parseJourneyPresentation, presentationAssetUrl, type PresentationAsset, type PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";
import type { getThemeRevisionHistory, StoredThemeRelease } from "@/lib/theme/theme-release-repository";

const viewportSizes = [[360, 800], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]] as const;
const tabs = ["Overzicht", "Werelden en assets", "Portaalpreview", "Controle en publicatie", "Versies"];
const inputClass = "w-full rounded-lg border border-border bg-background p-2 text-sm";
const panelClass = "space-y-4 rounded-2xl border border-border bg-card p-5";
const stringify = (value: unknown) => JSON.stringify(value, null, 2);

export function ThemeReleaseEditor({ stored, versions, revisions }: { stored: StoredThemeRelease; versions: { release: string; status: string; import_revision: number }[]; revisions: Awaited<ReturnType<typeof getThemeRevisionHistory>> }) {
  const [base, setBase] = useState(stored), [nativeJson, setNativeJson] = useState(stringify(stored.manifest)), [richJson, setRichJson] = useState(stringify(stored.presentation));
  const [tab, setTab] = useState(tabs[0]), [worldId, setWorldId] = useState(Object.keys(stored.presentation.worlds)[0]), [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [layers, setLayers] = useState({ back: true, mid: true, front: true }), [zones, setZones] = useState(true), [frameWidth, setFrameWidth] = useState(390);
  const [copyState, copyAction, copying] = useActionState(copyThemeVersionAction, {});
  const [newWorldId, setNewWorldId] = useState(""), [editorError, setEditorError] = useState("");
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const objectUrls = useRef(new Set<string>());
  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const [state, action, pending] = useActionState(updateThemeLibraryAction, {});
  const dirty = !matchesThemeDocument(nativeJson, base.manifest) || !matchesThemeDocument(richJson, base.presentation);
  const native = useMemo(() => { try { return JSON.parse(nativeJson); } catch { return null; } }, [nativeJson]);
  const parsed = useMemo(() => { try { return { presentation: parseJourneyPresentation(JSON.parse(richJson)), error: null }; } catch (error) { return { presentation: null, error: error instanceof Error ? error.message : "Ongeldige presentatie" }; } }, [richJson]);
  const lastValid = useRef(stored.presentation);
  if (parsed.presentation) lastValid.current = parsed.presentation;
  const presentation = parsed.presentation ?? lastValid.current, world = presentation.worlds[worldId], scene = world?.[orientation];
  const worldName = (() => { try { const value = JSON.parse(richJson).worlds?.[worldId]?.name; return typeof value === "string" ? value : world?.name ?? ""; } catch { return world?.name ?? ""; } })();
  const editable = base.status !== "published";
  useEffect(() => {
    if (!dirty || (matchesThemeDocument(nativeJson, stored.manifest) && matchesThemeDocument(richJson, stored.presentation))) {
      setBase(stored); setNativeJson(stringify(stored.manifest)); setRichJson(stringify(stored.presentation));
    }
    // A background refresh never discards a dirty local edit or silently advances its revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || event.metaKey || event.ctrlKey || event.button !== 0) return;
      if (!window.confirm("Je hebt niet-opgeslagen conceptwijzigingen. Wil je deze pagina verlaten?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
  function editPresentation(next: PortalJourneyPresentationV1) { setRichJson(stringify(next)); }
  function uploadedAsset(id: string, asset: PresentationAsset, file: File) {
    const previous = presentation.assets[id], native = JSON.parse(nativeJson);
    if (previous && (previous.width !== asset.width || previous.height !== asset.height) && Object.values(presentation.worlds).some((entry) => [entry.landscape, entry.portrait].some((part) => Object.values(part.layers).includes(id)))) throw new Error("Deze laag hoort bij een vast canvas. Gebruik dezelfde afmetingen of voeg het beeld onder een nieuwe asset-ID toe.");
    for (const entry of Object.values(native.assets) as Array<Record<string, unknown>>) {
      if (previous && entry?.path === `/portal-themes/${previous.objectKey}`) {
        if (asset.mime === "image/jpeg") throw new Error("Deze native slot vereist PNG, WebP of AVIF. Kies een van deze formaten.");
        Object.assign(entry, { path: `/portal-themes/${asset.objectKey}`, contentHash: asset.contentHash, mimeType: asset.mime, width: asset.width, height: asset.height });
      }
    }
    const next = parseJourneyPresentation({ ...presentation, assets: { ...presentation.assets, [id]: asset } });
    const url = URL.createObjectURL(file); objectUrls.current.add(url); setLocalImages((previous) => ({ ...previous, [asset.objectKey]: url }));
    editPresentation(next); setNativeJson(stringify(native));
  }
  function duplicateWorld() {
    setEditorError("");
    try {
      if (!world || presentation.themeId === "nxttrack-default" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(newWorldId) || Object.hasOwn(presentation.worlds, newWorldId)) throw new Error("Kies een nieuwe, unieke wereld-ID");
      const copy = { ...world, id: newWorldId, name: `${world.name} kopie`, landscape: { ...world.landscape, anchorSource: { ...world.landscape.anchorSource, status: "adapted" } }, portrait: { ...world.portrait, anchorSource: { ...world.portrait.anchorSource, status: "adapted" } } };
      editPresentation(parseJourneyPresentation({ ...presentation, worlds: { ...presentation.worlds, [newWorldId]: copy } })); setWorldId(newWorldId); setNewWorldId("");
    } catch (error) { setEditorError(error instanceof Error ? error.message : "Wereld kon niet worden gekopieerd"); }
  }
  function removeWorld() {
    if (!editable || presentation.themeId === "nxttrack-default" || Object.keys(presentation.worlds).length < 2 || !window.confirm(`Verwijder ${world.name} uit dit concept? Eerdere revisies blijven bewaard.`)) return;
    const remaining = { ...presentation.worlds }; delete remaining[worldId]; editPresentation({ ...presentation, worlds: remaining }); setWorldId(Object.keys(remaining)[0]);
  }
  function changePoint(index: number, x: number, y: number) {
    if (!editable || !presentation || !world || !scene) return;
    const points = scene.controlPoints.map((point, position) => position === index ? { ...point, x: Math.round(Math.max(0, Math.min(100, x)) * 10) / 10, y: Math.round(Math.max(0, Math.min(100, y)) * 10) / 10 } : point);
    editPresentation({ ...presentation, worlds: { ...presentation.worlds, [worldId]: { ...world, [orientation]: { ...scene, controlPoints: points, anchorSource: { ...scene.anchorSource, status: "adapted" } } } } });
  }
  function dragPoint(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    changePoint(index, (event.clientX - bounds.x) / bounds.width * 100, (event.clientY - bounds.y) / bounds.height * 100);
  }
  function keyPoint(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!scene || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const point = scene.controlPoints[index], step = event.shiftKey ? 0.2 : 1;
    changePoint(index, point.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), point.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0));
  }
  const identityFields = <><input type="hidden" name="themeKey" value={base.manifest.theme.key} /><input type="hidden" name="release" value={base.manifest.theme.release} /><input type="hidden" name="revision" value={base.revision} /><input type="hidden" name="digest" value={base.digest} /></>;
  const assetUrl = (id: string) => presentation?.assets[id] ? localImages[presentation.assets[id].objectKey] ?? `${presentationAssetUrl(presentation.assets[id])}?preview=1` : "";
  const previewUrl = `/theme-preview/${base.manifest.theme.key}/${base.manifest.theme.release}`;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/platform/themes" className="text-sm font-bold text-primary">← Themabibliotheek</Link><h1 className="mt-2 text-3xl font-bold">{base.manifest.theme.displayName}</h1><p className="mt-1 text-sm">Versie {base.manifest.theme.release} · revisie {base.revision} · {base.status === "published" ? "Gepubliceerd" : base.status === "review" ? "Review vastgelegd" : "Concept"}</p></div>{base.status === "published" ? <Link href={`/api/platform/themes/${base.manifest.theme.key}/${base.manifest.theme.release}/export`} className="rounded-xl border px-4 py-3">Exporteer presentatie</Link> : null}</div>
    <nav aria-label="Themaversie" className="flex flex-wrap gap-2">{tabs.map((name) => <button type="button" key={name} aria-current={tab === name ? "page" : undefined} className={`rounded-xl px-4 py-3 text-sm font-bold ${tab === name ? "bg-primary text-primary-foreground" : "border bg-card"}`} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {state.error || parsed.error || editorError ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4">{state.error || parsed.error || editorError}</p> : null}
    {state.saved && !dirty ? <p role="status" className="rounded-xl bg-success/10 p-3 text-sm">{state.saved === "publish" ? "Versie gepubliceerd. Toewijzingen zijn niet gewijzigd." : state.saved === "review" ? "Review vastgelegd op deze inhoud." : "Concept opgeslagen."}</p> : null}
    {stored.revision !== base.revision ? <p role="alert">Er is een nieuwere revisie. Jouw invoer blijft staan; kopieer die zo nodig voordat je de actuele pagina herlaadt.</p> : null}
    {dirty ? <p role="status" className="text-sm font-bold text-warning">Niet-opgeslagen wijzigingen · eerdere review is voor deze wijzigingen niet geldig.</p> : null}
    <form onReset={(event) => event.preventDefault()} action={action} className="space-y-5">
      {identityFields}<input type="hidden" name="operation" value="save" /><input type="hidden" name="manifest" value={nativeJson} /><input type="hidden" name="presentation" value={richJson} />
      {tab === "Overzicht" ? <section className={panelClass}><h2 className="text-xl font-bold">Themagegevens</h2><label className="block">Naam<input className={inputClass} value={(() => { try { return JSON.parse(nativeJson).theme.displayName; } catch { return ""; } })()} disabled={!editable} maxLength={100} onChange={(event) => { try { const native = JSON.parse(nativeJson); native.theme.displayName = event.target.value; native.experience.publicDisplayName = event.target.value; setNativeJson(stringify(native)); } catch { /* Advanced JSON errors remain visible. */ } }} /></label><p>{Object.keys(presentation.worlds).length} werelden · {Object.keys(presentation.assets).length} assets · {base.presentation.role === "standard" ? "Standaard: neutrale parels" : "Custom: expliciete artworkkoppelingen"}</p><p className="text-sm">Publiceren zet de volledige presentatie vast. Een school gebruikt deze pas na een afzonderlijke toewijzing.</p>{native?.tokens?.color && native?.tokens?.gradient?.page && native?.tokens?.gradient?.sidebar && native?.tokens?.radius && native?.theme ? <ThemeTokenEditor manifest={native} disabled={!editable} onChange={(value) => setNativeJson(stringify(value))} /> : null}<details><summary>Native tokenprojectie</summary><textarea aria-label="Native manifest" className={`${inputClass} mt-3 font-mono`} rows={18} value={nativeJson} disabled={!editable} onChange={(event) => setNativeJson(event.target.value)} /></details></section> : null}
      {tab === "Werelden en assets" && presentation ? <>
        <div className="flex flex-wrap gap-4"><label>Wereld <select className={inputClass} value={worldId} onChange={(event) => setWorldId(event.target.value)}>{Object.values(presentation.worlds).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Oriëntatie <select className={inputClass} value={orientation} onChange={(event) => setOrientation(event.target.value as typeof orientation)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label className="self-end py-2"><input type="checkbox" checked={zones} onChange={(event) => setZones(event.target.checked)} /> Veilige zones</label></div>
        {scene && world ? <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]"><section className={panelClass}><h2 className="text-xl font-bold">Compositie en ankers</h2><div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-slate-100" style={{ aspectRatio: scene.intrinsic.width / scene.intrinsic.height }}>
          {(["back", "mid", "front"] as const).map((layer) => scene.layers[layer] && layers[layer] ? <img key={layer} src={assetUrl(scene.layers[layer]!)} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none" style={{ objectFit: scene.quality === "legacy-crop" ? "cover" : "fill" }} /> : null)}
          {zones ? <><div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-blue-600 bg-blue-100/30 p-1 text-xs" style={{ height: `${scene.safeZones.topFraction * 100}%` }}>Rustige bovenrand</div><div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-blue-600 bg-blue-100/30 p-1 text-xs" style={{ height: `${scene.safeZones.bottomFraction * 100}%` }}>Ruimte voor bediening en voortgang</div></> : null}
          {scene.controlPoints.map((point, index) => <button type="button" key={point.slotId} disabled={!editable} aria-label={`Layoutanker ${index + 1}: x ${point.x}, y ${point.y}`} className="absolute z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full border-2 border-white bg-primary text-sm font-bold text-primary-foreground shadow" style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={(event) => dragPoint(event, index)} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={(event) => keyPoint(event, index)}>{index + 1}</button>)}
        </div><p className="text-sm">Ankers zijn layoutpunten. Sleep of gebruik de pijltjestoetsen; Shift verfijnt de stap. Dit verandert geen curriculum.</p></section><section className={panelClass}><h2 className="text-xl font-bold">Lagen en identiteit</h2><label className="block">Wereldnaam<input className={inputClass} value={worldName} disabled={!editable} onChange={(event) => editPresentation({ ...presentation, worlds: { ...presentation.worlds, [worldId]: { ...world, name: event.target.value } } })} /></label>{(["back", "mid", "front"] as const).map((layer) => <div key={layer} className="space-y-2 rounded-xl border p-3"><label><input type="checkbox" checked={layers[layer]} onChange={(event) => setLayers({ ...layers, [layer]: event.target.checked })} /> {{ back: "Achtergrond", mid: "Middengrond", front: "Voorgrond" }[layer]}</label><select aria-label={`${layer} asset`} disabled={!editable} className={inputClass} value={scene.layers[layer] ?? ""} onChange={(event) => editPresentation({ ...presentation, worlds: { ...presentation.worlds, [worldId]: { ...world, [orientation]: { ...scene, layers: { ...scene.layers, [layer]: event.target.value || null } } } } })}><option value="">Geen laag</option>{Object.keys(presentation.assets).map((id) => <option key={id}>{id}</option>)}</select></div>)}<p className="text-sm">{scene.intrinsic.width} × {scene.intrinsic.height} · {scene.quality}. Lagen delen exact hetzelfde canvas.</p><p className="text-sm">Gids: {presentation.guide.mode}. {presentation.role === "standard" ? "Onderdeelillustraties blijven uitgeschakeld." : "Artwork verwijst uitsluitend naar expliciete stabiele identiteiten."}</p></section></div> : null}
        <section className={panelClass}><h2 className="text-xl font-bold">Werelden beheren</h2><p>Gebruik een bestaande compositie als start voor een nieuwe custom wereld. Dit maakt geen curriculumstage aan.</p><label>Nieuwe wereld-ID<input className={inputClass} value={newWorldId} onChange={(event) => setNewWorldId(event.target.value)} disabled={!editable || presentation.themeId === "nxttrack-default"} /></label><div className="flex flex-wrap gap-3"><button type="button" className="rounded-lg border p-3" disabled={!editable || !newWorldId || presentation.themeId === "nxttrack-default"} onClick={duplicateWorld}>Wereld dupliceren</button><button type="button" className="rounded-lg border p-3" disabled={!editable || Object.keys(presentation.worlds).length < 2 || presentation.themeId === "nxttrack-default"} onClick={removeWorld}>Geselecteerde wereld verwijderen</button></div></section>
        <ThemeSupportEditor key={`${base.revision}:support`} presentation={presentation} disabled={!editable || pending} onChange={editPresentation} />
        <ThemeGuideEditor key={`${base.revision}:${JSON.stringify(presentation.guide)}`} presentation={presentation} disabled={!editable || pending} onChange={(guide) => editPresentation({ ...presentation, guide })} />
        <section className={panelClass}><h2 className="text-xl font-bold">Assetbibliotheek</h2><ThemeAssetUpload themeKey={base.manifest.theme.key} release={base.manifest.theme.release} revision={base.revision} digest={base.digest} disabled={!editable || pending} onUploaded={uploadedAsset} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{Object.entries(presentation.assets).map(([id, asset]) => <div key={id} className="min-w-0 rounded-xl border p-2"><img src={assetUrl(id)} alt="" loading="lazy" className="h-28 w-full bg-slate-100 object-contain" /><strong className="mt-2 block break-words text-xs">{id}</strong><p className="text-xs">{asset.width} × {asset.height}{asset.hasAlpha ? " · alpha" : ""}</p></div>)}</div></section>
      </> : null}
      {editable && ["Overzicht", "Werelden en assets"].includes(tab) ? <section className={panelClass}><details><summary>Volledige presentatieconfiguratie</summary><textarea className={`${inputClass} mt-3 font-mono`} aria-label="Presentatie JSON" rows={18} value={richJson} onChange={(event) => setRichJson(event.target.value)} /></details><button disabled={pending || !dirty || !!parsed.error} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">{pending ? "Opslaan…" : "Concept opslaan"}</button></section> : null}
    </form>
    {tab === "Portaalpreview" ? <section className={panelClass}><h2 className="text-xl font-bold">Opgeslagen presentatie · revisie {base.revision}</h2>{dirty ? <p className="text-warning">Bewaar je wijzigingen om ze in deze preview te beoordelen.</p> : null}<div className="flex flex-wrap gap-3"><label>Viewport <select value={frameWidth} onChange={(event) => setFrameWidth(Number(event.target.value))} className={inputClass}>{viewportSizes.map(([width, height]) => <option value={width} key={width}>{width} × {height}</option>)}</select></label><a href={previewUrl} target="_blank" rel="noreferrer" className="self-end rounded-lg border px-4 py-2">Open apart</a></div><div className="max-w-full overflow-auto rounded-xl border bg-slate-100 p-2"><iframe title="Interactieve portaalpreview met uitsluitend fictieve gegevens" src={previewUrl} sandbox="allow-scripts allow-same-origin" style={{ width: frameWidth, height: viewportSizes.find(([width]) => width === frameWidth)?.[1] ?? 844, maxWidth: "none", border: 0 }} /></div></section> : null}
    {tab === "Controle en publicatie" ? <section className={panelClass}><h2 className="text-xl font-bold">Review van de opgeslagen inhoud</h2><ul className="space-y-2">{base.findings.map((finding, index) => <li key={index} className="rounded-lg bg-muted p-3 text-sm">{finding.message}</li>)}</ul><p className="break-all text-xs text-muted-foreground">Contentdigest: {base.digest}</p><form onReset={(event) => event.preventDefault()} action={action} className="space-y-3">{identityFields}<input type="hidden" name="operation" value="review" />{[["desktop", "Landscape, lagen en lange labels gecontroleerd"], ["mobile", "Portrait, gids, beweging en detailkaart gecontroleerd"], ["content", "Geen curriculumregels toegevoegd; neutraliteit en optionele assets gecontroleerd"], ["warnings", "Aandachtspunten gelezen en beoordeeld"]].map(([key, label]) => <label key={key} className="flex items-start gap-2"><input type="checkbox" name={key} disabled={!editable || dirty} required /><span>{label}</span></label>)}<button disabled={pending || !editable || dirty} className="rounded-xl border px-5 py-3 font-bold">Review vastleggen</button></form><form onReset={(event) => event.preventDefault()} action={action} className="space-y-3 border-t pt-4">{identityFields}<input type="hidden" name="operation" value="publish" /><label className="flex items-start gap-2"><input type="checkbox" name="confirm" required disabled={base.status !== "review" || dirty} /><span>Publiceer deze gecontroleerde versie als onveranderlijke presentatie. Geen school wordt automatisch omgezet.</span></label><button disabled={pending || base.status !== "review" || dirty} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Versie publiceren</button></form></section> : null}
    {tab === "Versies" ? <section className={panelClass}><h2 className="text-xl font-bold">Versiegeschiedenis</h2>{versions.map((entry) => <p key={entry.release}><Link className="font-bold text-primary" href={`/platform/themes/${base.manifest.theme.key}/${entry.release}`}>{entry.release}</Link> · {entry.status} · {entry.import_revision} revisies</p>)}
      <form onReset={(event) => event.preventDefault()} action={copyAction} className="grid gap-3 rounded-xl border p-4">{identityFields}<h3 className="font-bold">Nieuw concept vanuit deze versie</h3><label>Nieuw versienummer<input className={inputClass} name="newVersion" required pattern="\d+\.\d+\.\d+" placeholder="bijvoorbeeld 1.0.1" /></label><button className="rounded-lg border p-3" disabled={copying || dirty}>Nieuwe conceptversie maken</button>{copyState.error ? <p role="alert" className="text-danger">{copyState.error}</p> : null}</form>
      <h3 className="font-bold">Opgeslagen revisies van {base.manifest.theme.release}</h3><p>Een herstel schrijft een nieuwe conceptrevisie. De publicatie en toewijzingen veranderen niet; een nieuwe review blijft vereist.</p>
      {revisions.map((entry) => <details className="rounded-xl border p-4" key={entry.revision}><summary className="cursor-pointer font-bold">Revisie {entry.revision} · {new Date(entry.createdAt).toLocaleString("nl-NL")}</summary><p className="my-2 break-all text-xs">{entry.digest}</p><h4 className="font-bold">Verschillen met het huidige opgeslagen concept</h4>{entry.differences.length ? <ul>{entry.differences.map((diff, index) => <li key={index}>{diff.area} · {diff.identity}: {diff.change}</li>)}</ul> : <p>De presentatie is gelijk.</p>}
        {editable && entry.revision < base.revision ? <form onReset={(event) => event.preventDefault()} action={action} className="mt-3 grid gap-3">{identityFields}<input type="hidden" name="operation" value="restore" /><input type="hidden" name="restoreRevision" value={entry.revision} /><label><input type="checkbox" name="confirmRestore" required disabled={dirty || pending} /> Herstel deze inhoud als nieuwe conceptrevisie</label><button className="rounded-lg border p-3" disabled={dirty || pending}>Revisie {entry.revision} herstellen</button></form> : null}
      </details>)}
    </section> : null}
  </div>;
}

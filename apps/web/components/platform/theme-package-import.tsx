"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeGuidedMapping } from "./theme-guided-mapping";
import { createImportedThemeDraftAction } from "@/lib/domain/portal-theme-library-actions";
import type { GuidedThemeAnalysis, ThemeImportAnalysis } from "@/lib/theme/theme-package-adapters";

export type ThemeImportResult = { id: string; analysis: Omit<ThemeImportAnalysis, "files"> | GuidedThemeAnalysis };
export function ThemePackageImport({ initialResult = null }: { initialResult?: ThemeImportResult | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [state, action, saving] = useActionState(createImportedThemeDraftAction, {});
  const [result, setResult] = useState<ThemeImportResult | null>(initialResult), [error, setError] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const [version, setVersion] = useState(""); const upload = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => { const request=upload.current; if(request && request.readyState!==XMLHttpRequest.DONE) { request.onload=null;request.onerror=null;request.onabort=null;request.abort(); } },[]);
  function start(file?: File) {
    if (!file || busy) return;
    if (file.size > 64 * 1024 * 1024 || !/\.(zip|json)$/i.test(file.name)) { setError("Kies een ZIP of ondersteunde Studio-JSON van maximaal 64 MiB."); return; }
    setBusy(true); setError(""); setResult(null); setProgress(0);
    const request = new XMLHttpRequest(); upload.current = request;
    request.open("POST", "/api/platform/themes/import"); request.setRequestHeader("Content-Type", "application/octet-stream"); request.setRequestHeader("x-theme-filename", encodeURIComponent(file.name));
    if (version) request.setRequestHeader("x-theme-release", version);
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(event.loaded / event.total); };
    request.onload = () => { try { const data = JSON.parse(request.responseText); if (request.status !== 200) setError(data.error ?? "Import mislukt"); else { setResult(data); router.replace(`/platform/themes/import?import=${data.id}`); } } catch { setError("Geen geldige reactie ontvangen. Het actieve portaal is niet gewijzigd."); } setBusy(false);router.refresh(); };
    request.onerror = () => { setError("Verbinding verbroken. Controleer de opgeslagen imports voordat je opnieuw probeert."); setBusy(false);router.refresh(); };
    request.onabort = () => { setError("Import geannuleerd. Een eventueel ontvangen bronbestand blijft in quarantaine."); setBusy(false);router.refresh(); };
    request.send(file);
  }
  return <div className="space-y-5">
    {!result && !busy ? <section className="rounded-2xl border-2 border-dashed bg-card p-8 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); start(event.dataTransfer.files[0]); }}>
      <h2 className="text-xl font-bold">Sleep je themapakket hierheen</h2><p className="my-3 text-sm">ZIP met manifest en beelden, of een bekende Studio-JSON. Losse beelden in een ZIP krijgen eerst een begeleide koppeling.</p>
      <label className="block text-sm">Nieuwe releaseversie (optioneel)<input className="mx-auto my-3 block rounded-lg border p-2" value={version} placeholder="bijvoorbeeld 1.0.1" onChange={(event) => setVersion(event.target.value)} pattern="\d+\.\d+\.\d+" /></label>
      <input type="file" accept=".zip,.json" aria-label="Themapakket kiezen" onChange={(event) => start(event.target.files?.[0])} />
    </section> : null}
    {busy ? <section aria-live="polite" className="rounded-xl border bg-card p-6"><h2 className="font-bold">{progress < 1 ? "Bestand uploaden…" : "Beelden en pakket analyseren…"}</h2><progress max={1} value={progress} className="my-4 w-full" /><button type="button" onClick={() => upload.current?.abort()} className="rounded-lg border px-4 py-2">Import annuleren</button></section> : null}
    {error || state.error ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4">{error || state.error}</p> : null}
    {result ? <section className="space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="text-xl font-bold">{result.analysis.kind === "draft" ? result.analysis.manifest.theme.displayName : "Geef de losse beelden hun plek"}</h2>
      {result.analysis.kind === "draft" ? <><p>{Object.keys(result.analysis.presentation.worlds).length} werelden · {Object.keys(result.analysis.presentation.assets).length} assets · versie {result.analysis.presentation.runtimeRelease}</p><p>Het pakket is technisch gelezen. Bewaar het concept om de werelden te bewerken en de visuele review uit te voeren.</p>
        <button type="button" className="rounded-lg border p-3" onClick={() => setPreview(!preview)}>{preview ? "Preview sluiten" : "Preview bekijken vóór conceptopslag"}</button>{preview ? <iframe title="Importpreview met fictieve gegevens" src={`/theme-preview/import/${result.id}`} className="h-[850px] w-full rounded-xl border" /> : null}
        <form action={action}><input type="hidden" name="importId" value={result.id} /><button disabled={saving} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">{saving ? "Concept bewaren…" : "Bewaar als concept"}</button></form></> : <ThemeGuidedMapping id={result.id} analysis={result.analysis} />}
      <ul className="space-y-2 text-sm">{result.analysis.findings.map((finding, index) => <li key={index} className="rounded-lg bg-muted p-3">{finding.message}</li>)}</ul>
      <button type="button" onClick={() => setResult(null)} className="rounded-lg border px-4 py-2">Ander pakket kiezen</button>
    </section> : null}
  </div>;
}

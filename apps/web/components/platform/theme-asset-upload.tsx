"use client";
import { useRef, useState } from "react";
import type { PresentationAsset } from "@/lib/theme/portal-journey-presentation";

export function ThemeAssetUpload({ themeKey, release, revision, digest, disabled, onUploaded }: {
  themeKey: string; release: string; revision: number; digest: string; disabled: boolean;
  onUploaded: (id: string, asset: PresentationAsset, file: File) => void;
}) {
  const [id, setId] = useState(""), [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const requestRef = useRef<XMLHttpRequest | null>(null);
  function upload() {
    if (!file || disabled || busy) return;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) { setError("Kies een geldige semantische asset-ID"); return; }
    if (file.size > 20 * 1024 * 1024) { setError("Kies een rasterafbeelding van maximaal 20 MiB"); return; }
    setError(""); setBusy(true); setProgress(0); const request = new XMLHttpRequest(); requestRef.current = request;
    request.open("POST", `/api/platform/themes/${themeKey}/${release}/assets`); request.setRequestHeader("Content-Type", "application/octet-stream"); request.setRequestHeader("x-theme-filename", encodeURIComponent(file.name)); request.setRequestHeader("x-theme-revision", String(revision)); request.setRequestHeader("x-theme-digest", digest);
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(event.loaded / event.total); };
    request.onload = () => {
      try { const response = JSON.parse(request.responseText); if (request.status !== 200) throw new Error(response.error ?? "Upload niet afgerond"); onUploaded(id, response.asset, file); }
      catch (error) { setError(error instanceof Error ? error.message : "Geen geldige uploadreactie"); }
      setBusy(false);
    };
    request.onerror = () => { setError("Verbinding verbroken. De opgeslagen conceptinhoud is niet gewijzigd."); setBusy(false); };
    request.onabort = () => { setError("Upload afgebroken. Je eerdere concept blijft bewaard."); setBusy(false); };
    request.send(file);
  }
  return <div className="grid gap-3 rounded-xl border p-4"><h3 className="font-bold">Afbeelding toevoegen of vervangen</h3><p className="text-sm">Een bestaande asset-ID vervangt de afbeelding op de bijbehorende plekken. Bewaar het concept om de wijziging vast te leggen.</p>
    <label>Asset-ID<input className="mt-1 w-full rounded-lg border p-2" value={id} onChange={(event) => setId(event.target.value)} disabled={disabled || busy} maxLength={100} placeholder="bijvoorbeeld wereld-1.achtergrond" /></label>
    <label>Afbeelding<input className="mt-1 block" type="file" accept=".png,.webp,.avif,.jpg,.jpeg" disabled={disabled || busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    {busy ? <><progress max={1} value={progress} /><button type="button" onClick={() => requestRef.current?.abort()}>Upload annuleren</button></> : <button className="rounded-lg border p-3 font-bold" type="button" disabled={disabled || !file || !id} onClick={upload}>Afbeelding controleren</button>}
    {error ? <p role="alert" className="text-danger">{error}</p> : null}
  </div>;
}

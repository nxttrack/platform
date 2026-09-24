"use client";
import { useActionState, useState } from "react";
import { updatePortalThemeBindingAction, type ThemeBindingActionState } from "@/lib/domain/portal-theme-binding-actions";

type Binding = { id: string; program_id: string; curriculum_version_id: string; curriculum_stage_id: string; theme_key: string; theme_release: string; world_id: string; criterion_artwork_json: Record<string, string>; previous_binding_id: string | null };
type Props = {
  tenantId: string; mode: "legacy" | "platform";
  stages: { id: string; name: string; programId: string; versionId: string; programName: string; versionName: string }[];
  worlds: { value: string; label: string }[]; bindings: Binding[];
};
const field = "w-full rounded-lg border bg-background p-3";
function Feedback({ state }: { state: ThemeBindingActionState }) { return <div aria-live="polite">{state.error ? <p role="alert" className="text-danger">{state.error}</p> : state.saved ? <p className="text-success">Opgeslagen. De nieuwe koppeling geldt ook voor nieuwe portaalsessies.</p> : null}</div>; }
export function ThemeWorldBindings({ tenantId, mode, stages, worlds, bindings }: Props) {
  const [management, manage, changing] = useActionState(updatePortalThemeBindingAction, {});
  const [state, action, pending] = useActionState(updatePortalThemeBindingAction, {});
  const [target, setTarget] = useState("");
  const selected = stages.find((stage) => `${stage.programId}:${stage.versionId}:${stage.id}` === target);
  const current = bindings.find((row) => row.program_id === selected?.programId && row.curriculum_version_id === selected?.versionId && row.curriculum_stage_id === selected?.id);
  return <div className="grid gap-6">
    <section className="rounded-2xl border p-5"><h2 className="text-xl font-bold">Themakeuze beheren</h2>
      <p className="my-3">{mode === "platform" ? "Platformbeheer beheert de thema’s en curriculumwerelden. Organisatiebeheer en leerlingen kunnen deze niet overschrijven." : "Deze organisatie houdt de bestaande themakeuze. Zet platformbeheer expliciet aan voordat je curriculumwerelden koppelt."}</p>
      <form onReset={(event) => event.preventDefault()} action={manage} className="grid gap-3"><input type="hidden" name="operation" value="management" /><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="mode" value={mode === "platform" ? "legacy" : "platform"} />
        <label>Reden<input className={field} name="reason" minLength={3} maxLength={1000} required /></label>
        <button className="rounded-lg border p-3 font-bold" disabled={changing || (mode === "platform" && bindings.length > 0)}>{mode === "platform" ? "Bestaande themakeuze herstellen" : "Platformbeheer inschakelen"}</button>
        {mode === "platform" && bindings.length > 0 ? <p>Verwijder eerst de actieve wereldkoppelingen om de bestaande themakeuze te herstellen. Historie blijft bewaard.</p> : null}<Feedback state={management} />
      </form>
    </section>
    <section className="rounded-2xl border p-5"><h2 className="text-xl font-bold">Curriculumwereld koppelen</h2><p className="my-3">Kies de bestaande stage en de bijbehorende visuele wereld. Leerdoelen, voortgang en verdiende momenten veranderen hierdoor niet.</p>
      <form onReset={(event) => event.preventDefault()} action={action} className="grid gap-3"><input type="hidden" name="operation" value="bind" /><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="expectedBinding" value={current?.id ?? ""} />
        <label>Programma · versie · stage<select className={field} name="target" value={target} onChange={(event) => setTarget(event.target.value)} required><option value="">Kies een stage</option>{stages.map((stage) => <option key={stage.id} value={`${stage.programId}:${stage.versionId}:${stage.id}`}>{stage.programName} · {stage.versionName} · {stage.name}</option>)}</select></label>
        <label>Gepubliceerde wereld<select className={field} name="world" required key={current?.id ?? target} defaultValue={current ? `${current.theme_key}@${current.theme_release}#${current.world_id}` : ""}><option value="">Kies een wereld</option>{worlds.map((world) => <option key={world.value} value={world.value}>{world.label}</option>)}</select></label>
        <details><summary>Expliciete artworkkoppeling voor een custom thema</summary><p>Gebruik alleen bestaande stabiele criteriumsleutels van deze stage en asset-ID’s uit de gekozen release. Standaardthema’s houden neutrale parels.</p></details>
        <label>Artworkkoppeling<textarea name="artwork" className={field} rows={3} key={`art:${current?.id ?? target}`} defaultValue={JSON.stringify(current?.criterion_artwork_json ?? {}, null, 2)} /></label>
        <label>Reden<input className={field} name="reason" minLength={3} maxLength={1000} required /></label>
        <button className="rounded-lg border p-3 font-bold" disabled={pending || mode !== "platform" || !target || !worlds.length}>{current ? "Wereldkoppeling vervangen" : "Wereld koppelen"}</button><Feedback state={state} />
      </form>
    </section>
    <section className="grid gap-3"><h2 className="text-xl font-bold">Actieve koppelingen</h2>{bindings.length ? bindings.map((binding) => <BindingHistory key={binding.id} binding={binding} tenantId={tenantId} label={stages.find((stage) => stage.id === binding.curriculum_stage_id)?.name ?? binding.curriculum_stage_id} />) : <p>Er zijn nog geen wereldkoppelingen. Bestaande portaalillustraties blijven beschikbaar.</p>}</section>
  </div>;
}
function BindingHistory({ binding, tenantId, label }: { binding: Binding; tenantId: string; label: string }) {
  const [state, action, pending] = useActionState(updatePortalThemeBindingAction, {});
  return <form onReset={(event) => event.preventDefault()} action={action} className="grid gap-3 rounded-2xl border p-4"><strong>{label}: {binding.world_id}</strong><span>{binding.theme_key} · {binding.theme_release}</span>
    <input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="bindingId" value={binding.id} /><input type="hidden" name="expectedBinding" value={binding.id} /><input type="hidden" name="previousBinding" value={binding.previous_binding_id ?? ""} /><input type="hidden" name="target" value={`${binding.program_id}:${binding.curriculum_version_id}:${binding.curriculum_stage_id}`} />
    <label>Reden<input className={field} name="reason" required minLength={3} maxLength={1000} /></label>
    <div className="flex flex-wrap gap-3"><button className="rounded-lg border p-3" name="operation" value="rollback" disabled={pending || !binding.previous_binding_id}>Vorige wereld en versie herstellen</button><button className="rounded-lg border p-3" name="operation" value="remove" disabled={pending}>Koppeling verwijderen</button></div><Feedback state={state} />
  </form>;
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { recoverThemeImportAction } from "@/lib/domain/portal-theme-library-actions";

export type ThemeImportHistoryRow={id:string;source_name:string;status:string;created_at:string;retry_of:string|null};
const labels:Record<string,string>={received:'Ontvangen',analyzed:'Analyse gereed',draft:'Concept bewaard',rejected:'Afgewezen',cleaning:'Opruimen nog niet afgerond',cleaned:'Afgewezen bron opgeruimd'};
export function ThemeImportHistory({rows}:{rows:ThemeImportHistoryRow[]}) {
  return <details className="rounded-xl border p-4"><summary>Opgeslagen imports hervatten</summary><ul className="mt-3 grid gap-3">{rows.map(row=><ImportRow key={row.id} row={row}/>)}</ul></details>;
}
function ImportRow({row}:{row:ThemeImportHistoryRow}) {
  const [state,action,pending]=useActionState(recoverThemeImportAction,{});
  return <li className="space-y-3 rounded-lg border p-3" data-theme-import={row.id}>
    <p>{['analyzed','draft'].includes(row.status)?<Link className="underline" href={`/platform/themes/import?import=${row.id}`}>{row.source_name}</Link>:<strong>{row.source_name}</strong>} · {labels[row.status]??row.status} · {new Date(row.created_at).toLocaleString('nl-NL')}{row.retry_of?' · Nieuwe poging uit bewaarde bron':null}</p>
    {['received','rejected'].includes(row.status)?<form action={action}><input type="hidden" name="importId" value={row.id}/><input type="hidden" name="operation" value="retry"/><button type="submit" disabled={pending} className="min-h-11 rounded-lg border px-3 font-semibold">{pending?'Bezig…':'Analyse opnieuw proberen'}</button></form>:null}
    {['rejected','cleaning'].includes(row.status)?<form action={action} className="space-y-2"><input type="hidden" name="importId" value={row.id}/><input type="hidden" name="operation" value="cleanup"/><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmCleanup" required disabled={pending}/>Ruim alleen het afgewezen bronbestand en de tijdelijke previews op. De importhistorie blijft bewaard.</label><button type="submit" disabled={pending} className="min-h-11 rounded-lg border px-3 font-semibold">{pending?'Bezig…':row.status==='cleaning'?'Opruimen hervatten':'Afgewezen bron opruimen'}</button></form>:null}
    {state.error?<p role="alert">{state.error}</p>:state.saved?<p role="status">Afgewezen bron opgeruimd. Releases en historische afbeeldingen zijn behouden.</p>:null}
  </li>;
}

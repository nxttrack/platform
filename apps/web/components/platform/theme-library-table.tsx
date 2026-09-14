"use client";

import Link from "next/link";
import { useState } from "react";

export type ThemeLibraryRow = { key: string; release: string; name: string; role: string; status: string; worlds: number; revision: number };
export function ThemeLibraryTable({ rows }: { rows: ThemeLibraryRow[] }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [sort, setSort] = useState("name"), [direction, setDirection] = useState(1);
  const visible = rows.filter((row) => (status === "all" || row.status === status) && `${row.key} ${row.name} ${row.release}`.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl")))
    .sort((a, b) => direction * (sort === "worlds" ? a.worlds - b.worlds : a.name.localeCompare(b.name, "nl")) || b.release.localeCompare(a.release, "nl", { numeric: true }));
  function order(key: string) { setDirection(sort === key ? -direction : 1); setSort(key); }
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Geïmporteerde presentaties</h2><p className="mt-1 text-sm">{rows.filter((row) => row.status !== "published").length} concepten/reviews · {rows.filter((row) => row.status === "published").length} gepubliceerde versies</p></div><Link href="/platform/themes/import" className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Pakket importeren</Link></div>
    <div className="flex flex-wrap gap-3"><label className="grow">Zoeken<input className="mt-1 block w-full rounded-lg border p-2" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Thema, ID of versie" /></label><label>Status<select className="mt-1 block rounded-lg border p-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle versies</option><option value="draft">Concept</option><option value="review">Review</option><option value="published">Gepubliceerd</option></select></label></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3"><button onClick={() => order("name")}>Thema ↕</button></th><th className="p-3">Versie</th><th className="p-3"><button onClick={() => order("worlds")}>Werelden ↕</button></th><th className="p-3">Status</th><th className="p-3">Actie</th></tr></thead><tbody>{visible.map((row) => <tr key={`${row.key}@${row.release}`} className="border-b"><td className="p-3"><strong>{row.name}</strong><small className="block text-muted-foreground">{row.key} · {row.role === "standard" ? "Standaard" : "Custom"}</small></td><td className="p-3">{row.release}<small className="block">revisie {row.revision}</small></td><td className="p-3">{row.worlds}</td><td className="p-3">{row.status === "published" ? "Gepubliceerd" : row.status === "review" ? "Review" : "Concept"}</td><td className="p-3"><Link href={`/platform/themes/${row.key}/${row.release}`} className="font-bold text-primary">{row.status === "published" ? "Bekijk" : "Bewerken"}</Link></td></tr>)}</tbody></table></div>
    {!visible.length ? <p className="py-6 text-center text-muted-foreground">{rows.length ? "Geen presentaties gevonden. Pas je zoekopdracht aan." : "Nog geen pakketten geïmporteerd. De ingebouwde thema’s blijven hieronder beschikbaar."}</p> : null}
  </section>;
}

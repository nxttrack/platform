import Link from "next/link";
import type { ReactNode } from "react";

import { WaitTimeChip } from "@/components/public/wait-time-chip";
import type { WaitTimeBand } from "@/lib/domain/intake-recommendation-contract";

type IntakeProgram = { id: string; name: string; waitBand: WaitTimeBand };

export function IntakeProgramLayout({ programs, selectedProgramId, children }: {
  programs: IntakeProgram[];
  selectedProgramId?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-w-0 max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden space-y-4 xl:block">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Programma</p>
          <nav aria-label="Kies programma" className="mt-3 space-y-2">
            {programs.map((program) => {
              const active = selectedProgramId === program.id;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-xl border p-3 transition ${
                    active ? "border-primary bg-primary/[0.06] shadow-soft" : "border-border bg-white hover:border-primary/30"
                  }`}
                  href={`/intake?programma=${program.id}`}
                  key={program.id}
                >
                  <span className={`block text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{program.name}</span>
                  <WaitTimeChip band={program.waitBand} className="mt-2" />
                </Link>
              );
            })}
          </nav>
        </div>
        <p className="px-1 text-xs leading-5 text-muted-foreground">
          Wachttijden zijn indicatief. Een medewerker controleert niveau, planning en definitieve plaatsing.
        </p>
      </aside>

      <div className="min-w-0">
        <div className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-soft xl:hidden">
          <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Kies programma</p>
          <nav aria-label="Kies programma" className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {programs.map((program) => {
              const active = selectedProgramId === program.id;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`min-w-44 rounded-xl border px-3 py-2.5 transition ${
                    active ? "border-primary bg-primary/[0.06]" : "border-border bg-white"
                  }`}
                  href={`/intake?programma=${program.id}`}
                  key={program.id}
                >
                  <span className={`block truncate text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{program.name}</span>
                  <WaitTimeChip band={program.waitBand} className="mt-1.5" />
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}

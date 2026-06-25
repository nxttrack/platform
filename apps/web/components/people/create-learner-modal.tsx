"use client";

import { useState, type ReactNode } from "react";
import { UserPlus, X } from "lucide-react";

export function CreateLearnerModalFrame({ children, duplicateCount }: { children: ReactNode; duplicateCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" onClick={() => setOpen(true)} type="button">
        <UserPlus className="h-4 w-4" />
        Nieuwe leerling
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-start bg-slate-950/30 p-4 backdrop-blur-sm md:place-items-center" role="dialog" aria-modal="true" aria-labelledby="create-learner-title">
          <button className="absolute inset-0 cursor-default" aria-label="Sluit nieuwe leerling modal" onClick={() => setOpen(false)} type="button" />
          <div className="relative z-10 max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-card md:p-7">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Nieuwe leerlingflow</p>
                <h2 id="create-learner-title" className="mt-1 text-2xl font-bold">
                  Leerling, ouder, inschrijving en plaatsing
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Duplicaatcontrole geeft {duplicateCount} aandachtspunt(en). Controleer bij twijfel eerst het bestaande dossier.</p>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" aria-label="Sluiten" onClick={() => setOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}

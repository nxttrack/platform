"use client";

import { FileSpreadsheet, ScanSearch, ShieldCheck } from "lucide-react";
import { useRef } from "react";

import { Wizard } from "@/components/ui/wizard";
import { createImportJobAction } from "@/lib/domain/premium-operations-actions";

export function ImportWizard() {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={createImportJobAction} ref={formRef}>
      <Wizard completeLabel="Valideer import" onComplete={() => formRef.current?.requestSubmit()} steps={[
        { id: "type", title: "Bron kiezen", description: "Kies wat je importeert. Apply maakt alleen nieuwe records; bestaande records worden nooit stil overschreven.", content: <label className="grid gap-2 text-sm font-semibold">Gegevenstype<select className="h-11 rounded-lg border border-border bg-background px-3 font-normal" name="importType" defaultValue="participants"><option value="participants">Leerlingen</option><option value="guardians">Ouders/verzorgers</option><option value="groups">Groepen</option><option value="enrollments">Inschrijvingen</option><option value="payments">Betalingen</option><option value="mixed">Gemengd bestand</option></select></label> },
        { id: "upload", title: "CSV uploaden", description: "Maximaal 2 MB en 5.000 rijen. Komma en puntkomma worden automatisch herkend.", content: <label className="grid min-h-40 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-5 text-center transition hover:border-primary/50"><FileSpreadsheet className="size-9 text-primary" /><span className="mt-2 font-bold text-foreground">Selecteer CSV-bestand</span><span className="text-sm text-muted-foreground">Het bestand blijft binnen de gevalideerde importjob.</span><input accept=".csv,text/csv" className="mt-4 block max-w-full text-sm" name="file" required type="file" /></label> },
        { id: "validate", title: "Preview starten", description: "Na upload opent de werkbank voor veldmapping, referentiechecks, dry-run, apply en rollback.", content: <div className="grid gap-3 sm:grid-cols-2"><Info icon={ScanSearch} title="Automatische checks">Delimiter, headers, referenties, formaten en duplicaten.</Info><Info icon={ShieldCheck} title="Herstelbaar">Elke mutatie krijgt een manifest en auditlog voor veilige rollback.</Info></div> }
      ]} />
    </form>
  );
}

function Info({ children, icon: Icon, title }: { children: string; icon: typeof ScanSearch; title: string }) {
  return <div className="rounded-xl bg-muted p-4"><Icon className="size-5 text-primary" /><p className="mt-3 font-bold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{children}</p></div>;
}

import { ArrowRight, Clock, ListChecks, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicTenantSiteData, getTenantSlugFromRequest } from "@/lib/domain/public-site";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const [data, slug] = await Promise.all([getPublicTenantSiteData(), getTenantSlugFromRequest()]);

  if (!slug || !data) {
    return <Unavailable />;
  }

  return (
    <main>
      <section className="bg-card px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{data.tenant.name}</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground md:text-5xl">Programma's</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Bekijk beschikbare zwemprogramma's en kies meteen of je wilt inschrijven, een proefles wilt plannen, op de wachtlijst wilt of eerst informatie wilt ontvangen.</p>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
          {data.programs.map((program) => (
            <article className="flex min-h-[320px] flex-col rounded-xl border border-border bg-card p-5 shadow-soft" key={program.id}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{program.stages.length} badje(s)</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${program.capacityStatus === "available" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                  {program.availablePlaces > 0 ? `${program.availablePlaces} vrij` : "Wachtlijst"}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">{program.name}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{program.description ?? "Een heldere zwemlesroute met stages, lesgroepen en beschikbare capaciteit."}</p>
              <div className="mt-5 space-y-2">
                {program.stages.slice(0, 4).map((stage) => (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" key={stage.id}>
                    <Waves className="h-4 w-4 text-primary" />
                    <span>{stage.badge_label ?? stage.name}</span>
                  </div>
                ))}
              </div>
              <Link className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" href={`/intake?programma=${program.id}`}>
                Aanmelden <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>

        {data.programs.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">Deze zwemschool heeft nog geen actieve programma's gepubliceerd.</div>
        ) : null}
      </section>

      <section className="px-4 pb-12">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          <InfoCard icon={<ListChecks className="h-5 w-5" />} title="Inschrijven of wachtlijst" text="Als er geen directe plek is, komt de aanmelding binnen als wachtlijstvraag." />
          <InfoCard icon={<Clock className="h-5 w-5" />} title="Proefles" text="Vraag een proefles aan zonder dubbele route of apart formulier." />
          <InfoCard icon={<Waves className="h-5 w-5" />} title="Programma gekoppeld" text="De intake komt direct binnen bij het gekozen programma." />
        </div>
      </section>
    </main>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <h1 className="text-2xl font-bold text-foreground">Programma's niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Open deze pagina via een tenant-subdomain.</p>
      </section>
    </main>
  );
}

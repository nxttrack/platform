import Link from "next/link";
import type { ReactNode } from "react";
import { acceptSlotOfferAction, declineSlotOfferAction } from "@/lib/domain/placement-actions";
import { getPublicSlotOffer, type PublicSlotOffer } from "@/lib/domain/slot-offer";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const weekdayLabels: Record<number, string> = {
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
  7: "Zondag"
};

export const dynamic = "force-dynamic";

export default async function PlacementOfferPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const token = getParam(params, "token");
  const responseStatus = getParam(params, "status");
  const data = await getPublicSlotOffer(token);

  return (
    <main>
      <section className="bg-card px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Plaatsingsaanbod</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground md:text-5xl">Bevestig de aangeboden plek</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Controleer de groep en bevestig of je de plek wilt accepteren. De zwemschool verwerkt daarna de plaatsing.</p>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_0.75fr]">
          <article className="rounded-xl border border-border bg-card p-5 shadow-card">
            <StatusNotice data={data} responseStatus={responseStatus} />
            {data.status === "open" && data.entry && data.group ? (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voor</p>
                  <h2 className="mt-1 text-2xl font-bold text-foreground">{data.entry.participant_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{data.entry.parent_name}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Programma" value={data.program?.name ?? "Programma"} />
                  <Detail label="Badje/stage" value={data.stage?.name ?? "Nog te bevestigen"} />
                  <Detail label="Groep" value={data.group.name} />
                  <Detail label="Dag en tijd" value={formatGroupTime(data.group.default_weekday, data.group.default_start_time, data.group.default_end_time)} />
                </div>

                <div className="flex flex-wrap gap-3">
                  <form action={acceptSlotOfferAction}>
                    <input name="token" type="hidden" value={token ?? ""} />
                    <button className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground" type="submit">
                      Plek accepteren
                    </button>
                  </form>
                  <form action={declineSlotOfferAction}>
                    <input name="token" type="hidden" value={token ?? ""} />
                    <button className="rounded-lg border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted" type="submit">
                      Plek weigeren
                    </button>
                  </form>
                </div>
              </div>
            ) : null}
          </article>

          <aside className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-lg font-bold text-foreground">Wat gebeurt hierna?</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>Bij accepteren wordt de leerling gekoppeld aan het programma en de lesgroep.</p>
              <p>Bij weigeren blijft de zwemschool op de hoogte en kan er handmatig vervolg worden gekozen.</p>
              <p>Is de link verlopen of klopt er iets niet, neem dan contact op met de zwemschool.</p>
            </div>
            <Link className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline" href="/">
              Terug naar organisatiesite
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusNotice({ data, responseStatus }: { data: PublicSlotOffer; responseStatus?: string }) {
  if (responseStatus) {
    const message = responseStatusMessages[responseStatus] ?? "De aanvraag is verwerkt.";
    const tone = getResponseTone(responseStatus);

    return <Notice tone={tone}>{message}</Notice>;
  }

  if (data.status === "missing") {
    return <Notice tone="warning">Deze pagina heeft een aanbodtoken nodig.</Notice>;
  }

  if (data.status === "invalid") {
    return <Notice tone="danger">Deze aanbodlink is ongeldig.</Notice>;
  }

  if (data.status === "expired") {
    return <Notice tone="warning">Deze aanbodlink is verlopen.</Notice>;
  }

  if (data.status === "responded") {
    return <Notice tone="success">Dit aanbod is al verwerkt.</Notice>;
  }

  if (!data.entry || !data.group) {
    return <Notice tone="danger">Dit aanbod kan niet volledig worden geladen.</Notice>;
  }

  return <Notice tone="success">Er staat een plek klaar om te bevestigen. Deze link verloopt op {formatDate(data.offer?.expiresAt)}.</Notice>;
}

function Notice({ children, tone }: { children: ReactNode; tone: "success" | "warning" | "danger" }) {
  const classes = {
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    danger: "border-danger/20 bg-danger/10 text-danger"
  };

  return <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${classes[tone]}`}>{children}</p>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatGroupTime(weekday: number | null, startsAt: string | null, endsAt: string | null) {
  const day = weekday ? weekdayLabels[weekday] : null;
  const time = startsAt && endsAt ? `${startsAt.slice(0, 5)} - ${endsAt.slice(0, 5)}` : null;

  return [day, time].filter(Boolean).join(", ") || "In overleg";
}

function formatDate(value?: string) {
  if (!value) {
    return "onbekend";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function getResponseTone(status: string): "success" | "warning" | "danger" {
  if (status === "geaccepteerd" || status === "accepted") {
    return "success";
  }

  if (status === "geweigerd" || status === "declined" || status === "expired" || status === "revoked" || status === "verlopen" || status === "vol") {
    return "warning";
  }

  return "danger";
}

const responseStatusMessages: Record<string, string> = {
  geaccepteerd: "De plek is geaccepteerd. De leerling is gekoppeld aan de lesgroep.",
  geweigerd: "De plek is geweigerd. De zwemschool is hiervan op de hoogte.",
  verlopen: "Deze aanbodlink is verlopen.",
  vol: "Deze groep heeft inmiddels geen vrije capaciteit meer.",
  fout: "Het verwerken is niet gelukt. Neem contact op met de zwemschool.",
  ongeldig: "Deze aanbodlink is ongeldig.",
  accepted: "Dit aanbod is al geaccepteerd.",
  declined: "Dit aanbod is al geweigerd.",
  expired: "Dit aanbod is verlopen.",
  revoked: "Dit aanbod is ingetrokken."
};

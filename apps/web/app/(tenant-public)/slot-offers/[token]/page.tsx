import { AlertTriangle, ArrowLeft, CheckCircle2, Send, XCircle } from "lucide-react";
import Link from "next/link";

import { respondToSlotOfferAction } from "@/lib/placement/slot-offer-public-actions";

export const dynamic = "force-dynamic";

type SlotOfferRoutePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PublicSlotOfferPage({ params, searchParams }: SlotOfferRoutePageProps) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const status = getParam(query.status);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-background px-4 py-10 text-foreground md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <section className="w-full rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/85 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            NXTTRACK lesplek-aanbod
          </span>

          {status === "accepted" || status === "declined" || status === "expired" || status === "pending" || status === "invalid" ? (
            <ResponseState status={status} />
          ) : (
            <>
              <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Send className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">Plaatsingsaanbod beantwoorden</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Bevestig of we de aangeboden plek mogen vastzetten. Bij acceptatie wordt de leerling aan het programma en de groep gekoppeld; abonnement/betaling blijft een aparte stap.
              </p>
              <div className="mt-5 rounded-2xl bg-muted p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Aanbodtoken</p>
                <p className="mt-1 break-all font-mono text-sm font-semibold">{token}</p>
              </div>
              <form action={respondToSlotOfferAction} className="mt-6 grid gap-4">
                <input name="token" type="hidden" value={token} />
                <label className="grid gap-1 text-sm font-semibold">
                  Opmerking voor de zwemschool
                  <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name="parent_note" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Reden bij weigeren
                  <select className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name="decline_reason">
                    <option value="">Geen reden opgegeven</option>
                    <option value="Tijdstip past niet">Tijdstip past niet</option>
                    <option value="We willen later starten">We willen later starten</option>
                    <option value="We hebben een andere oplossing">We hebben een andere oplossing</option>
                    <option value="Neem eerst contact met ons op">Neem eerst contact met ons op</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-soft hover:bg-primary/90" name="response" type="submit" value="accepted">
                    <CheckCircle2 className="h-4 w-4" />
                    Accepteren
                  </button>
                  <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-5 py-2 text-sm font-bold text-slate-800 hover:bg-muted" name="response" type="submit" value="declined">
                    <XCircle className="h-4 w-4" />
                    Weigeren
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="mt-8">
            <Link className="inline-flex items-center gap-2 text-sm font-bold text-primary underline-offset-4 hover:underline" href="/">
              <ArrowLeft className="h-4 w-4" />
              Terug naar tenantwebsite
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function ResponseState({ status }: { status: "accepted" | "declined" | "expired" | "pending" | "invalid" }) {
  const accepted = status === "accepted";
  const declined = status === "declined";
  const expired = status === "expired";
  const pending = status === "pending";

  return (
    <>
      <div className={`mt-5 flex h-14 w-14 items-center justify-center rounded-2xl ${accepted ? "bg-emerald-500/10 text-emerald-700" : expired ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700"}`}>
        {accepted ? <CheckCircle2 className="h-6 w-6" /> : expired ? <AlertTriangle className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
      </div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">{accepted ? "Plaatsing geaccepteerd" : declined ? "Plaatsing geweigerd" : expired ? "Aanbod verlopen" : status === "invalid" ? "Aanbod niet gevonden" : "Reactie ontvangen"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {accepted
          ? "De plek is vastgezet. De zwemschool ziet de inschrijving en groepsplaatsing nu in de administratie."
          : declined
            ? "De zwemschool ziet dat het aanbod is geweigerd en kan de plek opnieuw matchen."
            : expired
              ? "Dit aanbod is verlopen. De tijdelijk vastgehouden plek is vrijgegeven; neem contact op met de zwemschool voor een nieuw voorstel."
              : status === "invalid"
                ? "Deze link is niet meer geldig. Controleer of je de nieuwste link uit je e-mail gebruikt of neem contact op met de zwemschool."
              : pending
                ? "Je reactie is ontvangen. De zwemschool controleert de plaatsing en neemt contact op als er iets niet klopt."
                : ""}
      </p>
    </>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

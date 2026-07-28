import { BadgeCheck, CalendarDays, ShieldAlert, ShieldCheck, Waves } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { verifyPublicCertificate } from "@/lib/domain/certificate-verification";

type PageProps = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";
export const metadata = { robots: { follow: false, index: false }, title: "Diploma verifiëren · NXTTRACK" };

export default async function DiplomaVerificationPage({ params }: PageProps) {
  const { code } = await params;
  const result = await verifyPublicCertificate(code);
  if (!result) notFound();
  const valid = result.status === "valid";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,.16),transparent_35%),linear-gradient(180deg,#f8fdff,#eff8ff)] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <Link className="inline-flex items-center gap-2 text-sm font-black tracking-tight text-slate-900" href="/"><span className="grid size-9 place-items-center rounded-xl bg-cyan-600 text-white"><Waves className="size-5" /></span>NXTTRACK</Link>
        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_90px_-35px_rgba(15,118,110,.4)]">
          <div className={valid ? "bg-gradient-to-r from-emerald-600 to-cyan-600 p-6 text-white" : "bg-gradient-to-r from-amber-600 to-orange-600 p-6 text-white"}>
            <div className="flex items-center gap-3">{valid ? <ShieldCheck className="size-9" /> : <ShieldAlert className="size-9" />}<div><p className="text-xs font-bold uppercase tracking-[.16em]">Authenticiteitscontrole</p><h1 className="mt-1 text-2xl font-black">{valid ? "Diploma is geldig" : "Diploma is ingetrokken"}</h1></div></div>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><BadgeCheck className="size-6" /></span><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">{result.organizationName}</p><h2 className="mt-1 text-xl font-black text-slate-950">{result.title}</h2><p className="mt-1 text-sm text-slate-600">Toegekend aan {result.holderLabel}</p></div></div>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Programma" value={result.programName} />
              <Detail label="Niveau" value={result.stageName} />
              <Detail label="Uitgegeven" value={formatDate(result.issuedOn)} />
              <Detail label="Controle" value={formatDateTime(result.verifiedAt)} />
            </dl>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600"><CalendarDays className="mt-0.5 size-5 shrink-0 text-cyan-700" /><p>Deze pagina toont bewust alleen minimale gegevens. Het originele diploma en persoonsgegevens blijven beveiligd in het ouderportaal.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-950">{value}</dd></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

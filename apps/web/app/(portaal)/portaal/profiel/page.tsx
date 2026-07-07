import { Mail, Phone, RefreshCcw, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Card, PageHeader } from "@/components/shell/ui";
import { updateParentProfileAction } from "@/lib/domain/parent-portal-actions";
import { getParentPortalData } from "@/lib/domain/parent-portal";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentProfilePage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const activeCredits = data.catchUpCredits.filter((credit) => credit.status === "available");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Profiel" title="Profiel basics" subtitle="Basisgegevens voor het ouderportaal." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <form action={updateParentProfileAction} className="grid gap-4 md:grid-cols-2">
            <Field defaultValue={data.profile?.full_name ?? data.user.displayName ?? ""} icon={<UserRound className="h-4 w-4" />} label="Naam" name="fullName" />
            <Field defaultValue={data.profile?.phone ?? ""} icon={<Phone className="h-4 w-4" />} label="Telefoon" name="phone" type="tel" />
            <div className="rounded-lg border border-border bg-muted px-3 py-3 md:col-span-2">
              <div className="flex items-center gap-2 text-primary">
                <Mail className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</p>
              </div>
              <p className="mt-1 text-sm font-bold text-foreground">{data.profile?.email ?? data.user.email ?? "Niet bekend"}</p>
            </div>
            <div className="md:col-span-2">
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">
                Profiel opslaan
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <Detail icon={<RefreshCcw className="h-4 w-4" />} label="Inhaalcredits" value={`${activeCredits.length} beschikbaar`} />
            <Detail icon={<RefreshCcw className="h-4 w-4" />} label="Annuleringstermijn" value={`${data.settings.lesson_cancellation_cutoff_hours} uur vooraf`} />
            <Detail icon={<RefreshCcw className="h-4 w-4" />} label="Credit geldig" value={`${data.settings.lesson_cancellation_credit_window_days} dagen`} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ defaultValue, icon, label, name, type = "text" }: { defaultValue: string; icon: ReactNode; label: string; name: string; type?: string }) {
  return (
    <label className="space-y-2 text-sm font-semibold text-foreground">
      <span className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <input
        className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        defaultValue={defaultValue}
        name={name}
        type={type}
      />
    </label>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Profiel opgeslagen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Opslaan is niet gelukt.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

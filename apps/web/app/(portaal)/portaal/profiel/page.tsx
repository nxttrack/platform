import { Mail, Phone, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Card, PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { WebPushSettings } from "@/components/parent/web-push-settings";
import {
  updateParentCommunicationPreferencesAction,
  updateParentMakeupPreferencesAction,
  updateParentProfileAction
} from "@/lib/domain/parent-portal-actions";
import { getParentMakeupCommunicationPreferences, getParentPortalData } from "@/lib/domain/parent-portal";
import { getOwnWebPushSettings } from "@/lib/domain/web-push";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentProfilePage({ searchParams }: PageProps) {
  const [data, communication, pushSettings, params] = await Promise.all([
    getParentPortalData(),
    getParentMakeupCommunicationPreferences(),
    getOwnWebPushSettings("/portaal/profiel"),
    searchParams ?? Promise.resolve({})
  ]);
  const savedValue = getParam(params, "saved");
  const saved = savedValue === "1" || savedValue === "makeup-preferences" || savedValue === "communication-preferences";
  const error = getParam(params, "error");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Account" title="Profiel en voorkeuren" subtitle="Beheer je contactgegevens en bepaal hoe de zwemschool je bereikt." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5">
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
      </div>

      <Card className="scroll-mt-24" >
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Inhaalmarktplaats</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Uitnodigingen voor passende inhaallessen</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Jij bepaalt hoe de zwemschool je mag wijzen op een vrijgekomen, passende plek. Een uitnodiging boekt nooit automatisch.
            </p>
          </div>
          <DirtyForm action={updateParentMakeupPreferencesAction} className="gap-3">
            <PreferenceToggle
              defaultChecked={communication.makeUpInAppEnabled}
              description="Toon passende inhaalmomenten veilig in het ouderportaal."
              label="Uitnodigingen in het portaal"
              name="makeUpInAppEnabled"
            />
            <PreferenceToggle
              defaultChecked={communication.makeUpEmailEnabled}
              description="Stuur naast de portaalmelding ook een e-mail. De plek blijft onbevestigd tot jij boekt."
              label="E-mail bij een passende plek"
              name="makeUpEmailEnabled"
            />
            <PreferenceToggle
              defaultChecked={communication.automaticMakeUpInvitesEnabled}
              description="Voorbereid voor een later door de zwemschool geconfigureerd recept; staat standaard uit en boekt nooit zelfstandig."
              label="Automatische uitnodigingsrecepten toestaan"
              name="automaticMakeUpInvitesEnabled"
            />
            <div>
              <button className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">
                Voorkeuren opslaan
              </button>
            </div>
          </DirtyForm>
        </div>
      </Card>

      <Card className="scroll-mt-24">
        <div id="communicatie" className="scroll-mt-24" />
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Communicatievoorkeuren</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Kies hoe we je bereiken</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Servicemails gaan over je lessen en account. Nieuwsbrieven zijn optioneel en kun je hier altijd weer uitzetten.
            </p>
          </div>
          <DirtyForm action={updateParentCommunicationPreferencesAction} className="gap-3">
            <PreferenceToggle defaultChecked={communication.inAppEnabled} description="Meldingen en nieuwe berichten in het beveiligde ouderportaal." label="In-app meldingen" name="inAppEnabled" />
            <PreferenceToggle defaultChecked={communication.transactionalEmailEnabled} description="Belangrijke service-informatie over lessen, planning en account." label="Servicemails" name="transactionalEmailEnabled" />
            <PreferenceToggle defaultChecked={communication.newsletterEmailEnabled} description="Redactioneel nieuws en updates van de zwemschool. Dit is altijd optioneel." label="Nieuwsbrieven per e-mail" name="newsletterEmailEnabled" />
            <label className="flex min-h-14 items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <input className="mt-1 size-5 accent-primary" name="marketingConsentConfirmation" type="checkbox" value="confirmed" />
              <span><strong className="block text-foreground">Toestemming bevestigen</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">Alleen nodig als je nieuwsbrieven inschakelt. Je kunt de toestemming later intrekken.</span></span>
            </label>
            <div><button className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">Communicatievoorkeuren opslaan</button></div>
          </DirtyForm>
        </div>
      </Card>

      <Card>
        <WebPushSettings {...pushSettings} />
      </Card>
    </div>
  );
}

function PreferenceToggle({ defaultChecked, description, label, name }: { defaultChecked: boolean; description: string; label: string; name: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3">
      <input className="mt-1 size-5 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" />
      <span>
        <span className="block text-sm font-bold text-foreground">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
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

import { savePlatformEmailSettingsAction, sendPlatformEmailTestAction } from "@/lib/email/actions";
import { getPlatformEmailSettingsView, type EmailProvider } from "@/lib/email/platform-settings";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  invalid_email: "Controleer het afzenderadres.",
  invalid_port: "Controleer de SMTP poort.",
  missing_from: "Vul een geldig afzenderadres in.",
  missing_sendgrid: "Vul een SendGrid API key in voordat je SendGrid API activeert.",
  missing_smtp: "Vul host, gebruiker en wachtwoord in voordat je SMTP activeert.",
  save_failed: "Instellingen opslaan is niet gelukt."
};

const providerLabels: Record<EmailProvider, string> = {
  sendgrid_api: "SendGrid API",
  smtp: "SMTP"
};

export default async function PlatformSettingsPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/platform/instellingen");
  const isPlatformOwner = context.platform?.roles.includes("platform_owner") ?? false;
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const test = getParam(params, "test");
  const settings = isPlatformOwner ? await getPlatformEmailSettingsView() : null;

  if (!isPlatformOwner) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform admin</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Instellingen</h1>
        </div>
        <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Alleen platform owners kunnen mailinstellingen beheren.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform admin</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Instellingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Beheer de platformbrede mailprovider voor uitnodigingen, resetcodes en notificaties.</p>
      </div>

      {saved ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Mailinstellingen zijn opgeslagen.</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{errorMessages[error] ?? "Instellingen verwerken is niet gelukt."}</p> : null}
      {test === "sent" ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Testmail is verzonden.</p> : null}
      {test === "failed" ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Testmail versturen is niet gelukt.</p> : null}
      {test === "invalid_email" ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Controleer het testadres.</p> : null}
      {settings && !settings.settingsAvailable ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">Mailinstellingen zijn nog niet beschikbaar op deze omgeving. Pas de database migration toe voordat je deze instellingen opslaat.</p>
      ) : null}

      <form action={savePlatformEmailSettingsAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Mailprovider</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Status: {settings?.enabled ? "actief" : "niet actief"} - Provider: {providerLabels[settings?.provider ?? "sendgrid_api"]}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <input className="size-4 rounded border-border" defaultChecked={settings?.enabled} name="enabled" type="checkbox" />
            Actief
          </label>
        </div>

        <fieldset className="mt-5 grid gap-3 md:grid-cols-2">
          <legend className="sr-only">Actieve provider</legend>
          <ProviderOption checked={settings?.provider !== "smtp"} description="Aanbevolen voor NXTTRACK. Gebruikt SendGrid rechtstreeks via HTTPS." label="SendGrid API" value="sendgrid_api" />
          <ProviderOption checked={settings?.provider === "smtp"} description="Alternatief via SMTP, bijvoorbeeld smtp.sendgrid.net met gebruiker apikey." label="SMTP" value="smtp" />
        </fieldset>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Afzender e-mail" name="fromEmail" defaultValue={settings?.fromEmail} placeholder="noreply@nxttrack.nl" type="email" />
          <Field label="Afzender naam" name="fromName" defaultValue={settings?.fromName || "NXTTRACK"} />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-white p-4">
          <div>
            <h3 className="text-base font-bold text-foreground">SendGrid API</h3>
            <p className="mt-1 text-sm text-muted-foreground">API key: {settings?.hasSendGridApiKey ? "ingesteld" : "niet ingesteld"}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="SendGrid API key" name="sendGridApiKey" placeholder={settings?.hasSendGridApiKey ? "Ongewijzigd laten" : "SG..."} type="password" />
            <div className="flex items-end pb-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <input className="size-4 rounded border-border" name="clearSendGridApiKey" type="checkbox" />
                API key wissen
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-white p-4">
          <div>
            <h3 className="text-base font-bold text-foreground">SMTP</h3>
            <p className="mt-1 text-sm text-muted-foreground">Wachtwoord: {settings?.hasSmtpPassword ? "ingesteld" : "niet ingesteld"}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="SMTP host" name="smtpHost" defaultValue={settings?.smtpHost} placeholder="smtp.sendgrid.net" />
            <Field label="SMTP poort" name="smtpPort" defaultValue={String(settings?.smtpPort ?? 587)} inputMode="numeric" />
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="smtpEncryption">
                Versleuteling
              </label>
              <select className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={settings?.smtpSecure ? "tls" : "starttls"} id="smtpEncryption" name="smtpEncryption">
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS</option>
              </select>
            </div>
            <Field label="SMTP gebruiker" name="smtpUser" defaultValue={settings?.smtpUser} placeholder="apikey" />
            <Field label="SMTP wachtwoord" name="smtpPassword" placeholder={settings?.hasSmtpPassword ? "Ongewijzigd laten" : ""} type="password" />
            <div className="flex items-end pb-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <input className="size-4 rounded border-border" name="clearSmtpPassword" type="checkbox" />
                SMTP wachtwoord wissen
              </label>
            </div>
          </div>
        </div>

        <button className="mt-5 h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60" disabled={!settings?.settingsAvailable} type="submit">
          Opslaan
        </button>
      </form>

      <form action={sendPlatformEmailTestAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold text-foreground">Testmail</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Ontvanger" name="testEmail" defaultValue={context.user.email ?? ""} type="email" />
          <button className="h-11 rounded-lg border border-border bg-white px-5 text-sm font-semibold text-foreground transition hover:bg-muted" type="submit">
            Test versturen
          </button>
        </div>
      </form>
    </section>
  );
}

function ProviderOption(props: { checked: boolean; description: string; label: string; value: EmailProvider }) {
  return (
    <label className="flex min-h-24 cursor-pointer gap-3 rounded-lg border border-border bg-white p-4 text-sm transition hover:bg-muted/40">
      <input className="mt-1 size-4" defaultChecked={props.checked} name="provider" type="radio" value={props.value} />
      <span>
        <span className="block font-bold text-foreground">{props.label}</span>
        <span className="mt-1 block text-muted-foreground">{props.description}</span>
      </span>
    </label>
  );
}

function Field(props: {
  defaultValue?: string;
  inputMode?: "numeric";
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground" htmlFor={props.name}>
        {props.label}
      </label>
      <input
        className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        defaultValue={props.defaultValue}
        id={props.name}
        inputMode={props.inputMode}
        name={props.name}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
      />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

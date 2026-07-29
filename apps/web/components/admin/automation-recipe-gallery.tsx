"use client";

import {
  BellRing,
  CakeSlice,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClockAlert,
  FlaskConical,
  GraduationCap,
  ListTodo,
  Pause,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  Waves
} from "lucide-react";
import { useMemo, useState } from "react";

import { StatusPill } from "@/components/shell/ui";
import {
  runAutomationRecipeAction,
  saveAutomationRecipeConfigAction,
  setAutomationRecipeEnabledAction
} from "@/lib/domain/automation-recipe-actions";
import {
  getAutomationRecipeDefinition,
  normalizeAutomationRecipeSettings,
  type AutomationRecipeCategory,
  type AutomationRecipeDefinition,
  type AutomationRecipeSettings
} from "@/lib/domain/automation-recipe-contract";

type GalleryConfig = {
  id: string;
  recipe_key: AutomationRecipeDefinition["key"];
  enabled: boolean;
  settings_json: Partial<AutomationRecipeSettings>;
  enabled_at: string | null;
};

const categoryLabels: Record<AutomationRecipeCategory | "all", string> = {
  all: "Alles",
  attendance: "Aanwezigheid",
  billing: "Financieel",
  engagement: "Betrokkenheid",
  placement: "Plaatsing",
  progress: "Voortgang"
};

const recipeIcons = {
  no_show_follow_up: ClockAlert,
  birthday_message: CakeSlice,
  offer_expiring: CalendarClock,
  long_absence: UsersRound,
  diploma_achieved: GraduationCap,
  payment_failed: CircleDollarSign,
  makeup_credit_expiring: Waves,
  graduation_reminder: BellRing,
  trial_lesson_follow_up: UserRoundCheck,
  waitlist_capacity_available: Sparkles
} as const;

export function AutomationRecipeGallery({
  canManage,
  configs,
  recipes
}: {
  canManage: boolean;
  configs: GalleryConfig[];
  recipes: readonly AutomationRecipeDefinition[];
}) {
  const [category, setCategory] = useState<AutomationRecipeCategory | "all">("all");
  const [search, setSearch] = useState("");
  const configByKey = useMemo(
    () => new Map(configs.map((config) => [config.recipe_key, config])),
    [configs]
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("nl");
    return recipes.filter((recipe) =>
      (category === "all" || recipe.category === category)
      && (!needle || `${recipe.name} ${recipe.summary} ${recipe.triggerLabel}`.toLocaleLowerCase("nl").includes(needle))
    );
  }, [category, recipes, search]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sky-950 shadow-soft lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Review-only veiligheidsgrens
          </h2>
          <p className="mt-1 text-[13px] leading-5">
            Recipes maken uitsluitend interne controletaken. Ze versturen geen e-mail, WhatsApp of SMS en wijzigen geen plaatsing, betaling of leerlingstatus.
          </p>
        </div>
        <StatusPill tone="info">Menselijke bevestiging verplicht</StatusPill>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="text-sm font-bold">WhatsApp en SMS zijn niet gekoppeld</p>
        <p className="mt-1 text-[13px] leading-5">
          Er is geen provider, consentregistratie of delivery-audit voor deze kanalen. Daarom zijn ze bewust niet selecteerbaar. Gebruik ze pas na een afzonderlijke, juridisch en technisch gecontroleerde integratie.
        </p>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 shadow-soft">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Zoek recipe</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Zoek op naam, signaal of doel…"
            type="search"
            value={search}
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter recipes op categorie">
          {(Object.keys(categoryLabels) as Array<AutomationRecipeCategory | "all">).map((value) => (
            <button
              aria-pressed={category === value}
              className={category === value
                ? "min-h-11 shrink-0 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
                : "min-h-11 shrink-0 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"}
              key={value}
              onClick={() => setCategory(value)}
              type="button"
            >
              {categoryLabels[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((recipe) => (
          <RecipeCard
            canManage={canManage}
            config={configByKey.get(recipe.key) ?? null}
            key={recipe.key}
            recipe={recipe}
          />
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Geen recipes gevonden voor deze filters.
        </p>
      ) : null}
    </div>
  );
}

function RecipeCard({
  canManage,
  config,
  recipe
}: {
  canManage: boolean;
  config: GalleryConfig | null;
  recipe: AutomationRecipeDefinition;
}) {
  const Icon = recipeIcons[recipe.key];
  const settings = normalizeAutomationRecipeSettings(
    config?.settings_json ?? {},
    getAutomationRecipeDefinition(recipe.key)
  );

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft" id={`recipe-${recipe.key}`}>
      <div className="border-b border-border bg-gradient-to-br from-card to-muted/35 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{categoryLabels[recipe.category]}</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">{recipe.name}</h2>
            </div>
          </div>
          <StatusPill tone={config?.enabled ? "success" : config ? "warning" : "neutral"}>
            {config?.enabled ? "Actief" : config ? "Concept" : "Niet ingesteld"}
          </StatusPill>
        </div>
        <p className="mt-4 text-[13px] leading-6 text-muted-foreground">{recipe.summary}</p>
        <dl className="mt-4 grid gap-2 rounded-xl border border-border bg-background/80 p-3 text-xs sm:grid-cols-2">
          <div><dt className="font-bold text-foreground">Trigger</dt><dd className="mt-1 text-muted-foreground">{recipe.triggerLabel}</dd></div>
          <div><dt className="font-bold text-foreground">Brondata</dt><dd className="mt-1 text-muted-foreground">{recipe.sourceLabel}</dd></div>
        </dl>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-2">
          {recipe.safeguards.map((item) => (
            <p className="flex gap-2 text-xs leading-5 text-foreground" key={item}>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {item}
            </p>
          ))}
        </div>
        <p className="rounded-xl border border-border bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">Consent:</strong> {recipe.consentNotice}
        </p>
        {recipe.builtInOverlap ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950">
            Let op: {recipe.builtInOverlap}
          </p>
        ) : null}

        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-bold">
            Veilige configuratie
            <span className="text-xs font-semibold text-primary group-open:hidden">Open</span>
            <span className="hidden text-xs font-semibold text-primary group-open:inline">Sluit</span>
          </summary>
          <form action={saveAutomationRecipeConfigAction} className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
            <input name="recipeKey" type="hidden" value={recipe.key} />
            <RecipeFields recipe={recipe} settings={settings} />
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-5 text-muted-foreground sm:col-span-2">
              Uitvoerkanaal: <strong className="text-foreground">interne controletaak</strong>. Externe delivery staat databasebreed uit.
            </p>
            <button
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
              disabled={!canManage}
              type="submit"
            >
              Configuratie opslaan
            </button>
          </form>
        </details>

        <div className="grid gap-3 sm:grid-cols-2">
          <form action={runAutomationRecipeAction}>
            <input name="recipeKey" type="hidden" value={recipe.key} />
            <input name="executionMode" type="hidden" value="test" />
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-bold hover:bg-muted disabled:opacity-50"
              disabled={!canManage}
              type="submit"
            >
              <FlaskConical className="size-4" aria-hidden="true" />
              Test zonder bijwerking
            </button>
          </form>

          <form action={setAutomationRecipeEnabledAction} className="grid gap-2">
            <input name="recipeKey" type="hidden" value={recipe.key} />
            <input name="enabled" type="hidden" value={config?.enabled ? "false" : "true"} />
            {!config?.enabled ? (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2 text-[11px] leading-4">
                <input className="mt-0.5 size-4" name="humanConfirmation" type="checkbox" value="confirmed" />
                Ik bevestig dat deze recipe alleen interne controletaken maakt.
              </label>
            ) : null}
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-bold hover:bg-muted disabled:opacity-50"
              disabled={!canManage}
              type="submit"
            >
              {config?.enabled ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {config?.enabled ? "Pauzeren" : "Activeren"}
            </button>
          </form>
        </div>

        {config?.enabled ? (
          <form action={runAutomationRecipeAction} className="grid gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <input name="recipeKey" type="hidden" value={recipe.key} />
            <input name="executionMode" type="hidden" value="live" />
            <label className="flex items-start gap-2 text-xs leading-5 text-foreground">
              <input className="mt-0.5 size-4" name="humanConfirmation" type="checkbox" value="confirmed" />
              Maak bij een geldig live signaal één interne controletaak. Er wordt niets extern verstuurd of operationeel gewijzigd.
            </label>
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              disabled={!canManage}
              type="submit"
            >
              <ListTodo className="size-4" aria-hidden="true" />
              Live signaal controleren
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function RecipeFields({
  recipe,
  settings
}: {
  recipe: AutomationRecipeDefinition;
  settings: AutomationRecipeSettings;
}) {
  const usesDaysAhead = ["birthday_message", "offer_expiring", "makeup_credit_expiring", "graduation_reminder"].includes(recipe.key);
  const usesLookback = ["no_show_follow_up", "long_absence", "diploma_achieved", "payment_failed", "trial_lesson_follow_up"].includes(recipe.key);
  const usesOccurrences = recipe.key === "no_show_follow_up";
  const usesConfidence = recipe.key === "waitlist_capacity_available";
  return (
    <>
      <NumberField defaultValue={settings.cooldownDays} label="Cooldown in dagen" max={90} min={1} name="cooldownDays" />
      {usesDaysAhead ? <NumberField defaultValue={settings.daysAhead} label="Vooruitkijken in dagen" max={30} min={0} name="daysAhead" /> : <HiddenSettings settings={settings} names={["daysAhead"]} />}
      {usesLookback ? <NumberField defaultValue={settings.lookbackDays} label="Terugkijken in dagen" max={365} min={1} name="lookbackDays" /> : <HiddenSettings settings={settings} names={["lookbackDays"]} />}
      {usesOccurrences ? <NumberField defaultValue={settings.minimumOccurrences} label="Minimum registraties" max={20} min={1} name="minimumOccurrences" /> : <HiddenSettings settings={settings} names={["minimumOccurrences"]} />}
      {usesConfidence ? <NumberField defaultValue={settings.minimumConfidence} label="Minimum confidence" max={1} min={0.5} name="minimumConfidence" step={0.05} /> : <HiddenSettings settings={settings} names={["minimumConfidence"]} />}
    </>
  );
}

function HiddenSettings({
  names,
  settings
}: {
  names: Array<keyof AutomationRecipeSettings>;
  settings: AutomationRecipeSettings;
}) {
  return <>{names.map((name) => <input key={name} name={name} type="hidden" value={settings[name]} />)}</>;
}

function NumberField({
  defaultValue,
  label,
  max,
  min,
  name,
  step
}: {
  defaultValue: number;
  label: string;
  max: number;
  min: number;
  name: keyof AutomationRecipeSettings;
  step?: number;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-foreground">
      {label}
      <input
        className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
        defaultValue={defaultValue}
        max={max}
        min={min}
        name={name}
        step={step}
        type="number"
      />
    </label>
  );
}

"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2, ShieldCheck, Users, Waves } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { Wizard } from "@/components/ui/wizard";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  previewGroupScheduleAction,
  publishGroupScheduleAction
} from "@/lib/domain/group-planning-actions";
import {
  parseGroupScheduleDraft,
  type GroupScheduleDraft,
  type PlanningConflictResult
} from "@/lib/domain/group-planning-contract";

type GroupCreationWizardProps = {
  defaultCapacityBorrowing: GroupScheduleDraft["capacityBorrowing"];
  instructors: Array<{ userId: string; label: string }>;
  programs: Array<{ id: string; name: string }>;
  resources: Array<{
    id: string;
    kind: string;
    name: string;
    parent_resource_id: string | null;
    safety_capacity: number | null;
  }>;
  stages: Array<{ id: string; name: string; program_id: string }>;
  templates: Array<{
    id: string;
    local_end_time: string;
    local_start_time: string;
    name: string;
    recurrence_interval_weeks: number;
    weekday: number;
  }>;
};

const weekdayLabels = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

export function GroupCreationWizard(props: GroupCreationWizardProps) {
  const [draft, setDraft] = useState<GroupScheduleDraft>({
    capacityBorrowing: props.defaultCapacityBorrowing,
    code: "",
    endTime: "",
    endsOn: "",
    flexCapacity: 1,
    hardCapacity: 10,
    instructorUserIds: [],
    lessonTimeTemplateId: "",
    name: "",
    offeringType: "regular",
    programId: "",
    reason: "Nieuwe groep na gecontroleerde planningspreview",
    recurrenceIntervalWeeks: 1,
    regularCapacity: 8,
    resourceId: "",
    stageId: "",
    startTime: "",
    startsOn: "",
    trialCapacity: 1,
    weekday: 1
  });
  const [preview, setPreview] = useState<PlanningConflictResult | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [idempotencyKey] = useState(() => `group-${crypto.randomUUID()}`);
  const [publishing, startPublishing] = useTransition();
  const previewSequence = useRef(0);
  const selectedResource = props.resources.find((resource) => resource.id === draft.resourceId);
  const filteredStages = props.stages.filter((stage) => stage.program_id === draft.programId);

  const previewable = useMemo(() => {
    try {
      parseGroupScheduleDraft(draft);
      return true;
    } catch {
      return false;
    }
  }, [draft]);

  useEffect(() => {
    if (!previewable) {
      previewSequence.current += 1;
      setPreview(null);
      setPreviewError("");
      setPreviewing(false);
      return;
    }
    const sequence = ++previewSequence.current;
    setPreviewing(true);
    const timeout = window.setTimeout(() => {
      void previewGroupScheduleAction(draft).then((response) => {
        if (sequence !== previewSequence.current) return;
        if (response.ok) {
          setPreview(response.result);
          setPreviewError("");
        } else {
          setPreview(null);
          setPreviewError(response.error);
        }
        setPreviewing(false);
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [draft, previewable]);

  function update<Key extends keyof GroupScheduleDraft>(key: Key, value: GroupScheduleDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
  }

  function selectTemplate(templateId: string) {
    const template = props.templates.find((item) => item.id === templateId);
    setDraft((current) => template ? {
      ...current,
      lessonTimeTemplateId: template.id,
      weekday: template.weekday,
      startTime: template.local_start_time.slice(0, 5),
      endTime: template.local_end_time.slice(0, 5),
      recurrenceIntervalWeeks: template.recurrence_interval_weeks
    } : { ...current, lessonTimeTemplateId: "" });
    setConfirmed(false);
  }

  function toggleInstructor(userId: string, checked: boolean) {
    update(
      "instructorUserIds",
      checked
        ? [...new Set([...draft.instructorUserIds, userId])]
        : draft.instructorUserIds.filter((id) => id !== userId)
    );
  }

  function publish() {
    setPublishError("");
    if (!preview?.canPublish || !confirmed) {
      setPublishError("Rond de live controle af en bevestig de transactionele publicatie.");
      return;
    }
    startPublishing(async () => {
      try {
        await publishGroupScheduleAction({
          draft,
          humanConfirmation: true,
          idempotencyKey
        });
      } catch {
        setPublishError("Publiceren is niet gelukt. De database heeft niets gedeeltelijk aangemaakt.");
      }
    });
  }

  return <div className="space-y-4">
    <LiveStatus error={previewError} preview={preview} previewing={previewing} />
    <Wizard
      completeLabel={publishing ? "Publiceren…" : "Transactioneel publiceren"}
      onComplete={publish}
      steps={[
        {
          id: "identity",
          title: "Groep",
          description: "Koppel uitsluitend bestaande programma- en badjemasterdata.",
          canContinue: Boolean(draft.name && draft.programId),
          content: <div className="grid gap-4 sm:grid-cols-2">
            <Control label="Naam"><Input maxLength={160} onChange={(event) => update("name", event.target.value)} placeholder="Maandag 16:00 Badje 1" required value={draft.name} /></Control>
            <Control label="Code" hint="Kleine letters, cijfers en koppeltekens."><Input maxLength={80} onChange={(event) => update("code", event.target.value.toLowerCase())} placeholder="ma-1600-b1" value={draft.code} /></Control>
            <Control label="Aanbodtype"><NativeSelect onChange={(event) => update("offeringType", event.target.value as GroupScheduleDraft["offeringType"])} value={draft.offeringType}><option value="regular">Reguliere groep</option><option value="vacation_course">Vakantiecursus</option><option value="turbo_course">Turbocursus</option><option value="temporary_series">Tijdelijke serie</option></NativeSelect></Control>
            <Control label="Programma"><NativeSelect onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value, stageId: "" }))} required value={draft.programId}><option value="">Kies programma</option>{props.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</NativeSelect></Control>
            <Control label="Huidig badje"><NativeSelect disabled={!draft.programId} onChange={(event) => update("stageId", event.target.value)} value={draft.stageId}><option value="">Geen specifiek badje</option>{filteredStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</NativeSelect></Control>
            <MasterdataHint href="/admin/programma">Programma of badje ontbreekt? Beheer de bestaande leerlijnmasterdata.</MasterdataHint>
          </div>
        },
        {
          id: "schedule",
          title: "Plaats & tijd",
          description: "Lokale lestijden worden server-side naar echte occurrences in de tenanttijdzone omgezet.",
          canContinue: Boolean(draft.resourceId && draft.startTime && draft.endTime && draft.startsOn && draft.endsOn),
          content: <div className="grid gap-4 sm:grid-cols-2">
            <Control label="Lestijdtemplate"><NativeSelect onChange={(event) => selectTemplate(event.target.value)} value={draft.lessonTimeTemplateId}><option value="">Handmatig kiezen</option>{props.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {weekdayLabels[template.weekday]} {template.local_start_time.slice(0, 5)}</option>)}</NativeSelect></Control>
            <Control label="Resource" hint={selectedResource?.safety_capacity === null ? "Geen veiligheidslimiet vastgelegd." : selectedResource ? `Veiligheidslimiet: ${selectedResource.safety_capacity}` : undefined}><NativeSelect onChange={(event) => update("resourceId", event.target.value)} required value={draft.resourceId}><option value="">Kies locatie, bad of baan</option>{props.resources.filter((resource) => resource.kind !== "location").map((resource) => <option key={resource.id} value={resource.id}>{resource.kind === "lane" ? "Baan" : resource.kind === "pool" ? "Bad" : "Resource"} · {resource.name}</option>)}</NativeSelect></Control>
            <Control label="Weekdag"><NativeSelect onChange={(event) => update("weekday", Number(event.target.value))} value={draft.weekday}>{weekdayLabels.slice(1).map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</NativeSelect></Control>
            <Control label="Iedere"><NativeSelect onChange={(event) => update("recurrenceIntervalWeeks", Number(event.target.value))} value={draft.recurrenceIntervalWeeks}><option value={1}>Week</option><option value={2}>2 weken</option><option value={3}>3 weken</option><option value={4}>4 weken</option></NativeSelect></Control>
            <Control label="Starttijd"><Input onChange={(event) => update("startTime", event.target.value)} required type="time" value={draft.startTime} /></Control>
            <Control label="Eindtijd"><Input onChange={(event) => update("endTime", event.target.value)} required type="time" value={draft.endTime} /></Control>
            <Control label="Startdatum"><Input onChange={(event) => update("startsOn", event.target.value)} required type="date" value={draft.startsOn} /></Control>
            <Control label="Einddatum"><Input onChange={(event) => update("endsOn", event.target.value)} required type="date" value={draft.endsOn} /></Control>
            <MasterdataHint href="#planning-masterdata">Resource, openingstijden of lestijd ontbreken? Maak ze hier via de echte masterdataflow.</MasterdataHint>
          </div>
        },
        {
          id: "safety",
          title: "Team & capaciteit",
          description: "Regulier, flex en proef blijven aparte buckets binnen één fysieke veiligheidslimiet.",
          canContinue: draft.instructorUserIds.length > 0,
          content: <div className="space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold">Instructeurs</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {props.instructors.map((instructor) => <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 text-sm font-semibold" key={instructor.userId}><input checked={draft.instructorUserIds.includes(instructor.userId)} className="size-4 accent-primary" onChange={(event) => toggleInstructor(instructor.userId, event.target.checked)} type="checkbox" />{instructor.label}</label>)}
              </div>
              {!props.instructors.length ? <p className="mt-2 text-sm text-danger">Maak eerst een actief instructeuraccount aan.</p> : null}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberControl label="Regulier" value={draft.regularCapacity} onChange={(value) => update("regularCapacity", value)} />
              <NumberControl label="Flex" value={draft.flexCapacity} onChange={(value) => update("flexCapacity", value)} />
              <NumberControl label="Proef" value={draft.trialCapacity} onChange={(value) => update("trialCapacity", value)} />
              <NumberControl label="Fysieke limiet" value={draft.hardCapacity} onChange={(value) => update("hardCapacity", value)} />
            </div>
            <Control label="Lenen tussen buckets" hint="Nooit boven de fysieke limiet; iedere boeking wordt opnieuw transactioneel gecontroleerd."><NativeSelect onChange={(event) => update("capacityBorrowing", event.target.value as GroupScheduleDraft["capacityBorrowing"])} value={draft.capacityBorrowing}><option value="none">Niet lenen</option><option value="flex_from_regular">Flex mag vrije reguliere plekken lenen</option><option value="bidirectional">Regulier en flex mogen onderling lenen</option></NativeSelect></Control>
            <MasterdataHint href="#planning-masterdata">Kwalificatie ontbreekt? Leg een geverifieerde kwalificatie vast in planningsmasterdata.</MasterdataHint>
          </div>
        },
        {
          id: "review",
          title: "Preview & publicatie",
          description: "De getoonde preview is adviserend; publiceren herhaalt exact dezelfde checks onder databaselocks.",
          canContinue: Boolean(preview?.canPublish && confirmed && !publishing),
          content: <div className="space-y-4">
            <ConflictPanel error={previewError} preview={preview} previewing={previewing} />
            <Control label="Auditreden"><Input maxLength={500} onChange={(event) => update("reason", event.target.value)} required value={draft.reason} /></Control>
            <label className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
              <input checked={confirmed} className="mt-1 size-4 accent-primary" disabled={!preview?.canPublish} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span><strong className="block">Menselijke publicatiebevestiging</strong>Ik bevestig de capaciteitsverdeling, kwalificaties, resources en {preview?.occurrenceCount ?? 0} te materialiseren lesmomenten. De database controleert alles opnieuw.</span>
            </label>
            {publishError ? <p aria-live="assertive" className="text-sm font-semibold text-danger">{publishError}</p> : null}
          </div>
        }
      ]}
    />
  </div>;
}

function LiveStatus({ error, preview, previewing }: { error: string; preview: PlanningConflictResult | null; previewing: boolean }) {
  return <div aria-live="polite" className={`flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${previewing ? "border-primary/20 bg-primary/5" : error || (preview && !preview.canPublish) ? "border-danger/20 bg-danger/5" : preview?.canPublish ? "border-success/20 bg-success/5" : "border-border bg-muted/20"}`}>
    {previewing ? <Loader2 className="size-5 animate-spin text-primary" /> : preview?.canPublish ? <ShieldCheck className="size-5 text-success" /> : error || preview ? <AlertTriangle className="size-5 text-danger" /> : <Clock3 className="size-5 text-muted-foreground" />}
    <span>{previewing ? "Live conflictcontrole…" : error || (preview ? preview.canPublish ? `${preview.occurrenceCount} lesmomenten controleerbaar · ${preview.warningCount} adviezen` : `${preview.hardConflictCount} blokkerende conflicten` : "Vul de verplichte velden in voor live conflictcontrole.")}</span>
  </div>;
}

function ConflictPanel({ error, preview, previewing }: { error: string; preview: PlanningConflictResult | null; previewing: boolean }) {
  if (previewing) return <p className="rounded-2xl border border-border bg-muted/20 p-4 text-sm">Conflictcontrole wordt uitgevoerd…</p>;
  if (error) return <p className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</p>;
  if (!preview) return <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nog geen complete preview.</p>;
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-3">
      <Summary icon={<Waves className="size-5" />} label="Occurrences" value={preview.occurrenceCount} />
      <Summary icon={<AlertTriangle className="size-5" />} label="Blokkerend" value={preview.hardConflictCount} />
      <Summary icon={<Users className="size-5" />} label="Adviezen" value={preview.warningCount} />
    </div>
    {preview.conflicts.length ? <ul className="space-y-2">{preview.conflicts.map((conflict, index) => <li className={`rounded-xl border p-3 text-sm ${conflict.blocking ? "border-danger/20 bg-danger/5" : "border-warning/30 bg-warning/10"}`} key={`${conflict.code}:${conflict.occurrenceDate ?? index}`}><div className="flex items-start gap-2">{conflict.blocking ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-warning-foreground" />}<span><strong className="block">{conflict.title}</strong><span className="text-muted-foreground">{conflict.detail}</span></span></div></li>)}</ul> : <p className="rounded-xl border border-success/20 bg-success/5 p-3 text-sm font-semibold text-success">Geen conflicten gevonden.</p>}
    {preview.truncated ? <p className="text-xs text-muted-foreground">De lijst is begrensd; publicatie blijft geblokkeerd tot alle harde conflicten zijn opgelost.</p> : null}
  </div>;
}

function Summary({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-background p-3"><span className="text-primary">{icon}</span><p className="mt-2 text-2xl font-bold">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p></div>;
}
function Control({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold"><span>{label}</span>{children}{hint ? <span className="text-xs font-normal leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}
function NumberControl({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return <Control label={label}><Input max={500} min={0} onChange={(event) => onChange(Number(event.target.value))} required type="number" value={value} /></Control>;
}
function MasterdataHint({ children, href }: { children: ReactNode; href: string }) {
  return <p className="self-end text-xs leading-5 text-muted-foreground sm:col-span-2"><Link className="font-semibold text-primary hover:underline" href={href}>{children}</Link></p>;
}

"use client";

import { FileText, MessageSquarePlus, Send, Settings2 } from "lucide-react";

import { RichTextEditor } from "@/components/communication/rich-text-editor";
import { Button } from "@/components/ui/button";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  createMessageThreadAction,
  createNewsletterCampaignAction,
  replyToMessageThreadAction,
  saveCommunicationTemplateAction,
  updateCommunicationSettingsAction,
  updateMessageThreadAction
} from "@/lib/domain/communication-hub-actions";
import {
  communicationShortcodes,
  communicationTemplateChannelLabels,
  communicationTemplateChannels,
  messageVisibilityLabels,
  newsletterSegmentLabels,
  newsletterSegments,
  threadStatusLabels,
  threadStatuses,
  threadTypeLabels,
  threadTypes
} from "@/lib/domain/communication-hub-contract";
import type {
  CommunicationEntityOption,
  CommunicationPersonOption,
  CommunicationTemplateRow,
  MessageThreadRow,
  TenantCommunicationSettings
} from "@/lib/domain/communication-hub";

const editorVariables = communicationShortcodes.map((variable) => ({
  label: variable.label,
  value: `{{${variable.key}}}`
}));

export function NewThreadForm({
  next,
  guardians = [],
  participants = [],
  groups = [],
  intakes = [],
  waitlistEntries = [],
  payments = [],
  graduationEvents = [],
  staff = [],
  instructors = [],
  parentMode = false
}: {
  next: string;
  guardians?: CommunicationPersonOption[];
  participants?: CommunicationEntityOption[];
  groups?: CommunicationEntityOption[];
  intakes?: CommunicationEntityOption[];
  waitlistEntries?: CommunicationEntityOption[];
  payments?: CommunicationEntityOption[];
  graduationEvents?: CommunicationEntityOption[];
  staff?: CommunicationPersonOption[];
  instructors?: CommunicationPersonOption[];
  parentMode?: boolean;
}) {
  return (
    <DirtyForm action={createMessageThreadAction} className="grid gap-4">
      <input name="next" type="hidden" value={next} />
      <Field>
        <FieldLabel htmlFor="new-thread-subject">Onderwerp</FieldLabel>
        <Input id="new-thread-subject" maxLength={180} name="subject" placeholder="Vraag over de planning" required />
      </Field>
      <Field>
        <FieldLabel htmlFor="new-thread-type">Categorie</FieldLabel>
        <NativeSelect defaultValue="general" id="new-thread-type" name="threadType">
          {threadTypes.filter((type) => !parentMode || type !== "internal").map((type) => (
            <option key={type} value={type}>{threadTypeLabels[type]}</option>
          ))}
        </NativeSelect>
      </Field>
      {!parentMode ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectOption id="new-thread-guardian" label="Ouder/verzorger" name="guardianUserId" options={guardians} />
          <SelectOption id="new-thread-staff" label="Behandelaar" name="assignedStaffId" options={staff} />
          <SelectOption id="new-thread-instructor" label="Instructeur (optioneel)" name="assignedInstructorId" options={instructors} />
          <SelectEntity id="new-thread-group" label="Groep (optioneel)" name="groupId" options={groups} />
          <SelectEntity id="new-thread-intake" label="Intake (optioneel)" name="intakeSubmissionId" options={intakes} />
          <SelectEntity id="new-thread-waitlist" label="Wachtlijst (optioneel)" name="waitlistEntryId" options={waitlistEntries} />
          <SelectEntity id="new-thread-payment" label="Betaling (optioneel)" name="paymentId" options={payments} />
          <SelectEntity id="new-thread-graduation" label="Afzwemmoment (optioneel)" name="graduationEventId" options={graduationEvents} />
        </div>
      ) : null}
      <SelectEntity id="new-thread-participant" label={parentMode ? "Over welk kind gaat dit?" : "Leerling (optioneel)"} name="participantId" options={participants} required={parentMode && participants.length > 1} />
      <Field>
        <FieldLabel htmlFor="new-thread-message">Bericht</FieldLabel>
        <Textarea className="min-h-36" id="new-thread-message" maxLength={8_000} name="plainText" placeholder="Beschrijf je vraag zo duidelijk mogelijk. Deel geen medische details die niet nodig zijn." required />
        <FieldDescription>Het bericht wordt alleen gedeeld met deelnemers aan dit gesprek.</FieldDescription>
      </Field>
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Bijlagen zijn bewust nog uitgeschakeld. Ze worden pas toegevoegd met private Storage, malwarecontrole en dezelfde threadrechten.
      </div>
      <Confirmation label="Ik heb ontvangers en inhoud gecontroleerd en wil dit bericht versturen." />
      <SubmitButton>
        <MessageSquarePlus className="size-4" />
        Gesprek starten
      </SubmitButton>
    </DirtyForm>
  );
}

export function ThreadReplyForm({
  threadId,
  next,
  allowInternal = false,
  canReply = true
}: {
  threadId: string;
  next: string;
  allowInternal?: boolean;
  canReply?: boolean;
}) {
  if (!canReply && !allowInternal) {
    return (
      <p className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
        Je kunt interne context toevoegen wanneer dit gesprek is toegewezen. Rechtstreeks antwoorden aan ouders staat uit in de tenantinstellingen.
      </p>
    );
  }

  return (
    <DirtyForm action={replyToMessageThreadAction} className="grid gap-3">
      <input name="threadId" type="hidden" value={threadId} />
      <input name="next" type="hidden" value={next} />
      {allowInternal ? (
        <Field>
          <FieldLabel htmlFor={`visibility-${threadId}`}>Soort reactie</FieldLabel>
          <NativeSelect defaultValue={canReply ? "public_to_thread" : "internal_note"} id={`visibility-${threadId}`} name="visibility">
            {(canReply
              ? (["public_to_thread", "internal_note", "staff_only"] as const)
              : (["internal_note", "staff_only"] as const)
            ).map((visibility) => (
              <option key={visibility} value={visibility}>{messageVisibilityLabels[visibility]}</option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <input name="visibility" type="hidden" value="public_to_thread" />
      )}
      <Field>
        <FieldLabel htmlFor={`reply-${threadId}`}>Reactie</FieldLabel>
        <Textarea className="min-h-28" id={`reply-${threadId}`} maxLength={8_000} name="plainText" placeholder="Schrijf een helder antwoord…" required />
      </Field>
      <Confirmation label="Ik heb de inhoud en zichtbaarheid gecontroleerd." />
      <SubmitButton>
        <Send className="size-4" />
        Reactie opslaan
      </SubmitButton>
    </DirtyForm>
  );
}

export function ThreadManagementForm({
  thread,
  next,
  staff,
  instructors
}: {
  thread: MessageThreadRow;
  next: string;
  staff: CommunicationPersonOption[];
  instructors: CommunicationPersonOption[];
}) {
  return (
    <DirtyForm action={updateMessageThreadAction} className="grid gap-3">
      <input name="threadId" type="hidden" value={thread.id} />
      <input name="next" type="hidden" value={next} />
      <Field>
        <FieldLabel htmlFor={`status-${thread.id}`}>Status</FieldLabel>
        <NativeSelect defaultValue={thread.status} id={`status-${thread.id}`} name="status">
          {threadStatuses.map((status) => <option key={status} value={status}>{threadStatusLabels[status]}</option>)}
        </NativeSelect>
      </Field>
      <SelectOption defaultValue={thread.assigned_staff_user_id ?? ""} id={`staff-${thread.id}`} label="Behandelaar" name="assignedStaffId" options={staff} />
      <SelectOption defaultValue={thread.assigned_instructor_user_id ?? ""} id={`instructor-${thread.id}`} label="Instructeur" name="assignedInstructorId" options={instructors} />
      <Confirmation label="Ik bevestig deze status- en toewijzingswijziging." />
      <SubmitButton>
        <Settings2 className="size-4" />
        Gesprek bijwerken
      </SubmitButton>
    </DirtyForm>
  );
}

export function CommunicationTemplateForm({
  template
}: {
  template?: CommunicationTemplateRow;
}) {
  return (
    <DirtyForm action={saveCommunicationTemplateAction} className="grid gap-4">
      <input name="next" type="hidden" value="/admin/templates" />
      {template ? <input name="templateId" type="hidden" value={template.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`template-name-${template?.id ?? "new"}`}>Naam</FieldLabel>
          <Input defaultValue={template?.name} id={`template-name-${template?.id ?? "new"}`} maxLength={160} name="name" placeholder="Afzwemherinnering" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`template-key-${template?.id ?? "new"}`}>Technische sleutel</FieldLabel>
          <Input defaultValue={template?.template_key} id={`template-key-${template?.id ?? "new"}`} maxLength={100} name="templateKey" pattern="[a-z0-9_]+" placeholder="graduation_reminder" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`template-channel-${template?.id ?? "new"}`}>Kanaal</FieldLabel>
          <NativeSelect defaultValue={template?.channel ?? "email"} id={`template-channel-${template?.id ?? "new"}`} name="channel">
            {communicationTemplateChannels.map((channel) => <option key={channel} value={channel}>{communicationTemplateChannelLabels[channel]}</option>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`template-status-${template?.id ?? "new"}`}>Status</FieldLabel>
          <NativeSelect defaultValue={template?.status ?? "active"} id={`template-status-${template?.id ?? "new"}`} name="status">
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`template-subject-${template?.id ?? "new"}`}>Onderwerp</FieldLabel>
        <Input defaultValue={template?.subject ?? ""} id={`template-subject-${template?.id ?? "new"}`} maxLength={220} name="subject" placeholder="{{child_name}} zwemt binnenkort af" />
      </Field>
      <RichTextEditor
        description="Alleen bekende shortcodes worden opgeslagen. Scripts, embeds, afbeeldingen en onveilige links worden verwijderd."
        initialHtml={template?.content_html ?? ""}
        initialJson={template?.content_json}
        required
        variables={editorVariables}
      />
      <SubmitButton>
        <FileText className="size-4" />
        Template opslaan
      </SubmitButton>
    </DirtyForm>
  );
}

export function NewsletterCampaignForm({
  groups = [],
  programs = [],
  stages = []
}: {
  groups?: CommunicationEntityOption[];
  programs?: CommunicationEntityOption[];
  stages?: CommunicationEntityOption[];
}) {
  return (
    <DirtyForm action={createNewsletterCampaignAction} className="grid gap-4">
      <input name="next" type="hidden" value="/admin/nieuwsbrieven" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="campaign-title">Interne titel</FieldLabel>
          <Input id="campaign-title" maxLength={180} name="title" placeholder="Zomernieuws juli" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="campaign-subject">E-mailonderwerp</FieldLabel>
          <Input id="campaign-subject" maxLength={220} name="subject" placeholder="Nieuws van {{tenant_name}}" required />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="campaign-preheader">Preheader</FieldLabel>
        <Input id="campaign-preheader" maxLength={240} name="preheader" placeholder="De belangrijkste updates in één minuut." />
      </Field>
      <Field>
        <FieldLabel htmlFor="campaign-segment">Segment</FieldLabel>
        <NativeSelect defaultValue="all_parents" id="campaign-segment" name="segment">
          {newsletterSegments.map((segment) => <option key={segment} value={segment}>{newsletterSegmentLabels[segment]}</option>)}
        </NativeSelect>
        <FieldDescription>Ontvangers zonder aantoonbare toestemming worden altijd uitgesloten.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="campaign-segment-reference">Programma, groep of badje</FieldLabel>
        <NativeSelect id="campaign-segment-reference" name="segmentReferenceId">
          <option value="">Niet van toepassing / kies bij een gericht segment</option>
          <optgroup label="Programma's">{programs.map((item) => <option key={`program-${item.id}`} value={item.id}>{item.label}</option>)}</optgroup>
          <optgroup label="Groepen">{groups.map((item) => <option key={`group-${item.id}`} value={item.id}>{item.label}</option>)}</optgroup>
          <optgroup label="Badjes en niveaus">{stages.map((item) => <option key={`stage-${item.id}`} value={item.id}>{item.label}</option>)}</optgroup>
        </NativeSelect>
        <FieldDescription>Kies alleen een referentie bij ouders per programma, groep of badje. De server controleert het type en de organisatie opnieuw.</FieldDescription>
      </Field>
      <RichTextEditor
        description="Nieuwsbriefdelivery heeft nog geen geverifieerde sender. Je kunt de inhoud veilig als concept voorbereiden."
        required
        variables={editorVariables}
      />
      <input name="status" type="hidden" value="draft" />
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
        Concept-only: er wordt niets ingepland, verzonden of als deliverysucces geregistreerd.
      </div>
      <SubmitButton>
        <FileText className="size-4" />
        Concept opslaan
      </SubmitButton>
    </DirtyForm>
  );
}

export function CommunicationSettingsForm({
  settings
}: {
  settings: TenantCommunicationSettings;
}) {
  return (
    <DirtyForm action={updateCommunicationSettingsAction} className="grid gap-5">
      <input name="next" type="hidden" value="/admin/communicatie-instellingen" />
      <Field>
        <FieldLabel htmlFor="instructor-thread-visibility">Instructeurstoegang tot oudergesprekken</FieldLabel>
        <NativeSelect defaultValue={settings.instructors_can_view_parent_threads} id="instructor-thread-visibility" name="instructorThreadVisibility">
          <option value="assigned_only">Alleen expliciet toegewezen</option>
          <option value="own_groups">Toegewezen en eigen groepen</option>
        </NativeSelect>
        <FieldDescription>De veilige standaard is alleen expliciet toegewezen gesprekken.</FieldDescription>
      </Field>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <input className="mt-1 size-4 accent-primary" defaultChecked={settings.instructors_can_reply_to_parents} name="instructorsCanReply" type="checkbox" />
        <span><strong className="block text-foreground">Instructeurs mogen rechtstreeks antwoorden</strong><span className="mt-1 block text-muted-foreground">Een reactie blijft een bewuste, handmatig bevestigde actie. Interne notities blijven afgeschermd.</span></span>
      </label>
      <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
        <p className="font-semibold text-warning">WhatsApp en SMS zijn veilig uitgeschakeld</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Deze kanalen worden pas beschikbaar na afzonderlijke providerconfiguratie, expliciete toestemming en juridische controle.</p>
      </div>
      <Confirmation label="Ik heb de gevolgen voor instructeurstoegang gecontroleerd." />
      <SubmitButton>Instellingen opslaan</SubmitButton>
    </DirtyForm>
  );
}

function Confirmation({ label }: { label: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm font-medium text-foreground">
      <input className="mt-0.5 size-4 accent-primary" name="humanConfirmation" required type="checkbox" value="confirmed" />
      <span>{label}</span>
    </label>
  );
}

function SelectOption({
  defaultValue = "",
  id,
  label,
  name,
  options
}: {
  defaultValue?: string;
  id: string;
  label: string;
  name: string;
  options: CommunicationPersonOption[];
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect defaultValue={defaultValue} id={id} name={name}>
        <option value="">Niet gekozen</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}{option.email ? ` · ${option.email}` : ""}</option>)}
      </NativeSelect>
    </Field>
  );
}

function SelectEntity({
  id,
  label,
  name,
  options,
  required = false
}: {
  id: string;
  label: string;
  name: string;
  options: CommunicationEntityOption[];
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required={required}>
        <option value="">Niet gekoppeld</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </NativeSelect>
    </Field>
  );
}

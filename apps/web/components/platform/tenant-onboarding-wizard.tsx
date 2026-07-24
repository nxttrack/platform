"use client";

import { Building2, CreditCard, MapPin, Palette, ShieldCheck, Users, Waves } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Wizard } from "@/components/ui/wizard";
import { provisionTenantAction } from "@/lib/domain/tenant-lifecycle-actions";

export function TenantOnboardingWizard() {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={provisionTenantAction} ref={formRef}>
      <Wizard completeLabel="Controleren en openen" onComplete={() => formRef.current?.requestSubmit()} steps={[
        { id: "organization", title: "Zwemschool", description: "De juridische en technische tenant-identiteit.", content: <StepGrid icon={Building2}><TextField label="Naam zwemschool" name="name" placeholder="Zwemacademie De Waterlijn" /><TextField label="Slug" name="slug" placeholder="de-waterlijn" /><TextField label="Primair domein" name="hostname" placeholder="de-waterlijn.nxttrack.nl" /><TextField label="Productnaam" name="productName" placeholder="De Waterlijn" /></StepGrid> },
        { id: "owner", title: "Eigenaar", description: "De eigenaar ontvangt een beveiligde uitnodiging en tijdelijke toegang.", content: <StepGrid icon={Users}><TextField autoComplete="name" label="Naam eigenaar" name="ownerName" /><TextField autoComplete="email" label="E-mail eigenaar" name="ownerEmail" type="email" /></StepGrid> },
        { id: "identity", title: "Branding", description: "Een herkenbare basis die later onder tenantbeheer verfijnd kan worden.", content: <StepGrid icon={Palette}><ColorField label="Primaire kleur" name="primaryColor" value="#1d4ed8" /><ColorField label="Accentkleur" name="accentColor" value="#06b6d4" /></StepGrid> },
        { id: "program", title: "Programma", description: "Het eerste programma en de opeenvolgende badjes/niveaus.", content: <StepGrid icon={Waves}><TextField defaultValue="Zwem-ABC" label="Programmanaam" name="programName" /><TextField defaultValue="Watervrij, Basis, Diploma A, Diploma B, Diploma C" label="Badjes / niveaus" name="stageNames" /></StepGrid> },
        { id: "operations", title: "Planning", description: "Locatie, bad en eerste operationele groep.", content: <StepGrid icon={MapPin}><TextField label="Locatie" name="locationName" placeholder="Sportcentrum De Branding" /><TextField label="Zwembad" name="poolName" placeholder="Wedstrijdbad" /><TextField defaultValue="Zwem-ABC · maandag 16:00" label="Eerste groep" name="groupName" /><NumberField defaultValue="10" label="Capaciteit" name="groupCapacity" /><Field><FieldLabel htmlFor="weekday">Lesdag</FieldLabel><NativeSelect id="weekday" name="weekday" defaultValue="1"><option value="1">Maandag</option><option value="2">Dinsdag</option><option value="3">Woensdag</option><option value="4">Donderdag</option><option value="5">Vrijdag</option><option value="6">Zaterdag</option><option value="7">Zondag</option></NativeSelect></Field><TextField defaultValue="16:00" label="Starttijd" name="startTime" type="time" /><TextField defaultValue="16:45" label="Eindtijd" name="endTime" type="time" /></StepGrid> },
        { id: "staff", title: "Medewerkers", description: "Optioneel: verstuur direct instructeuruitnodigingen.", content: <StepGrid icon={Users}><TextField label="E-mailadressen (komma-gescheiden)" name="staffEmails" required={false} placeholder="sanne@zwemschool.nl, omar@zwemschool.nl" /></StepGrid> },
        { id: "billing", title: "Betaalplan", description: "Maak een actief maandabonnement; verfijning blijft mogelijk.", content: <StepGrid icon={CreditCard}><NumberField defaultValue="49.50" label="Maandbedrag (€)" name="monthlyAmount" step="0.01" /></StepGrid> },
        { id: "opening", title: "Openingscontrole", description: "NXTTRACK maakt de tenant pas actief als alle kerngegevens, relaties en uitnodigingen correct zijn aangemaakt.", content: <div className="rounded-2xl border border-success/30 bg-success/5 p-5"><ShieldCheck className="size-8 text-success" /><p className="mt-3 font-bold text-foreground">Gecontroleerde provisioning</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Bij een fout blijft de tenant gesloten en toont het runlog exact waar opvolging nodig is. Een custom domein blijft pending totdat DNS is geverifieerd.</p></div> }
      ]} />
      <noscript><Button className="mt-4" type="submit">Tenant aanmaken</Button></noscript>
    </form>
  );
}

function StepGrid({ children, icon: Icon }: { children: React.ReactNode; icon: typeof Building2 }) {
  return <div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Icon className="size-7 text-primary" /></div>{children}</div>;
}
function TextField({ label, name, required = true, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string; required?: boolean }) {
  return <Field><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} name={name} required={required} {...props} /></Field>;
}
function NumberField(props: React.ComponentProps<typeof TextField>) { return <TextField min="1" type="number" {...props} />; }
function ColorField({ label, name, value }: { label: string; name: string; value: string }) { return <Field><FieldLabel htmlFor={name}>{label}</FieldLabel><div className="flex gap-2"><Input className="size-11 p-1" id={name} name={name} type="color" defaultValue={value} /><Input aria-label={`${label} hexcode`} defaultValue={value} readOnly /></div></Field>; }

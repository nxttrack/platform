import { useId, type ReactNode } from "react";

import { Field as FieldRoot, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton as PendingSubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

export function AdminSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
  description,
  disabled = false,
  autoComplete
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  description?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <FieldRoot>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        aria-describedby={descriptionId}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        disabled={disabled}
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
    </FieldRoot>
  );
}

export function TextAreaField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  const id = useId();

  return (
    <FieldRoot>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} name={name} placeholder={placeholder} />
    </FieldRoot>
  );
}

export function SelectField({
  label,
  name,
  required = false,
  children
}: {
  label: string;
  name: string;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <FieldRoot>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} name={name} required={required}>
        {children}
      </NativeSelect>
    </FieldRoot>
  );
}

export function SubmitButton({ children = "Opslaan" }: { children?: ReactNode }) {
  return <PendingSubmitButton>{children}</PendingSubmitButton>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

export function DataList({ children }: { children: ReactNode }) {
  return <div role="list" className="divide-y divide-border rounded-lg border border-border">{children}</div>;
}

export function DataListRow({ title, meta, aside }: { title: string; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <div role="listitem" className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {aside ? <div className="text-right text-xs font-semibold text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

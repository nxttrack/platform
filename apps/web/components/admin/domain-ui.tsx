import type { ReactNode } from "react";

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
  defaultValue
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}) {
  return (
    <label className="space-y-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

export function TextAreaField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="space-y-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <textarea
        className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        name={name}
        placeholder={placeholder}
      />
    </label>
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
  return (
    <label className="space-y-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <select className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name={name} required={required}>
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ children = "Opslaan" }: { children?: ReactNode }) {
  return (
    <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" type="submit">
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

export function DataList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border rounded-lg border border-border">{children}</div>;
}

export function DataListRow({ title, meta, aside }: { title: string; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {aside ? <div className="text-right text-xs font-semibold text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

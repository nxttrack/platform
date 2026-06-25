"use client";

import { useActionState, type ReactNode } from "react";

type FormState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

type AdminActionFormProps = {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
};

const initialState: FormState = {
  status: "idle",
  message: null
};

export function AdminActionForm({ action, children, className, successMessage = "Opgeslagen." }: AdminActionFormProps) {
  const [state, formAction, pending] = useActionState(async (_state: FormState, formData: FormData) => {
    try {
      await action(formData);

      return {
        status: "success" as const,
        message: successMessage
      };
    } catch (error) {
      return {
        status: "error" as const,
        message: error instanceof Error ? error.message : "Actie kon niet worden uitgevoerd."
      };
    }
  }, initialState);

  return (
    <form action={formAction} className={`group ${className ?? ""}`} data-pending={pending ? "true" : "false"}>
      <fieldset className="contents" disabled={pending}>
        {children}
      </fieldset>
      <FormStateMessage state={state} />
    </form>
  );
}

export function AdminSubmitButton({ children, className }: { children: ReactNode; className: string }) {
  return (
    <button className={`${className} disabled:cursor-not-allowed disabled:opacity-60`} type="submit">
      <span className="group-data-[pending=true]:hidden">{children}</span>
      <span className="hidden group-data-[pending=true]:inline">Bezig...</span>
    </button>
  );
}

function FormStateMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
        state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

"use client";

import { useId, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children?: ReactNode;
  className?: string;
  confirmLabel: string;
  description: string;
  hiddenFields: Record<string, string>;
  title: string;
  triggerLabel: ReactNode;
  triggerVariant?: "default" | "destructive" | "outline";
};

export function ConfirmActionForm({
  action,
  children,
  className,
  confirmLabel,
  description,
  hiddenFields,
  title,
  triggerLabel,
  triggerVariant = "default"
}: ConfirmActionFormProps) {
  const formId = useId();

  return (
    <form action={action} className={className} id={formId}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      {children}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button className={buttonVariants({ size: "sm", variant: triggerVariant })} type="button">
            {triggerLabel}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button className={buttonVariants({ variant: "outline" })} type="button">
                Terug
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button className={cn(buttonVariants({ variant: "destructive" }))} form={formId} type="submit">
                {confirmLabel}
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

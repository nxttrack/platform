"use client";

import { Check } from "lucide-react";
import { Children, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type WizardStep = { id: string; title: string; description?: string; content: ReactNode; canContinue?: boolean };

export function Wizard({ steps, onComplete, completeLabel = "Afronden" }: { steps: WizardStep[]; onComplete?: () => void; completeLabel?: string }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const complete = index === steps.length - 1;
  if (!step) return null;

  return <div className="grid gap-5"><div className="grid gap-3"><div className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Stap {index + 1} van {steps.length}</span><span>{Math.round(((index + 1) / steps.length) * 100)}%</span></div><Progress aria-label="Wizardvoortgang" value={((index + 1) / steps.length) * 100} /><ol className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">{steps.map((item, itemIndex) => <li aria-current={itemIndex === index ? "step" : undefined} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium", itemIndex === index && "border-primary bg-primary/5 text-primary", itemIndex < index && "border-success/30 bg-success/5 text-success")} key={item.id}>{itemIndex < index ? <Check className="size-4" /> : <span className="flex size-5 items-center justify-center rounded-full bg-muted">{itemIndex + 1}</span>}<span className="truncate">{item.title}</span></li>)}</ol></div>{steps.map((item, itemIndex) => <section aria-labelledby={`wizard-${item.id}`} className="rounded-2xl border border-border bg-card p-5" hidden={itemIndex !== index} key={item.id}><h2 className="text-xl font-bold" id={`wizard-${item.id}`}>{item.title}</h2>{item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}<div className="mt-5">{Children.toArray(item.content)}</div></section>)}<div className="flex justify-between gap-3"><Button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} variant="outline">Vorige</Button><Button disabled={step.canContinue === false} onClick={() => complete ? onComplete?.() : setIndex((value) => Math.min(steps.length - 1, value + 1))}>{complete ? completeLabel : "Volgende"}</Button></div></div>;
}

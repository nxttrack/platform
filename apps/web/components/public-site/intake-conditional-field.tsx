"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { IntakeCondition } from "@/lib/public-site/tenant-site";

export function IntakeConditionalField({ children, condition }: { children: ReactNode; condition?: IntakeCondition | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!condition);

  useEffect(() => {
    if (!condition) {
      return;
    }

    const update = () => {
      const values = answerValues(condition.question);
      const nextVisible = evaluateCondition(condition, values);
      setVisible(nextVisible);
      setContainedControlsDisabled(containerRef.current, !nextVisible);
    };

    update();
    document.addEventListener("input", update);
    document.addEventListener("change", update);

    return () => {
      document.removeEventListener("input", update);
      document.removeEventListener("change", update);
    };
  }, [condition]);

  return (
    <div className={visible ? "" : "hidden"} data-condition-question={condition?.question ?? ""} ref={containerRef}>
      {children}
    </div>
  );
}

function answerValues(question: string) {
  const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="answer_${CSS.escape(question)}"]`));

  return controls.flatMap((control) => {
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
      return control.checked ? [control.value] : [];
    }

    return control.value ? [control.value] : [];
  });
}

function evaluateCondition(condition: IntakeCondition, values: string[]) {
  if (condition.operator === "exists") {
    return values.some(Boolean);
  }

  const expected = Array.isArray(condition.value) ? condition.value : condition.value ? [condition.value] : [];

  if (condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  return true;
}

function setContainedControlsDisabled(container: HTMLDivElement | null, disabled: boolean) {
  if (!container) {
    return;
  }

  const controls = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  controls.forEach((control) => {
    control.disabled = disabled;
  });
}

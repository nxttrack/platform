"use client";

import { useState, type ReactNode } from "react";

type AdminTab = {
  id: string;
  label: string;
  count?: number;
  children: ReactNode;
};

export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const firstTab = tabs[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState(firstTab);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!active) {
    return null;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
        {tabs.map((tab) => {
          const selected = tab.id === active.id;

          return (
            <button
              key={tab.id}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${selected ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${selected ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>
      {active.children}
    </div>
  );
}

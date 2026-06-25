"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react";

type AdminTableEnhancerProps = {
  children: ReactNode;
  rowCount: number;
};

export function AdminTableEnhancer({ children, rowCount }: AdminTableEnhancerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(rowCount);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(visibleCount / pageSize));

  useEffect(() => {
    setStatusOptions(collectStatusOptions(rootRef.current));
  }, [rowCount]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const tbody = root.querySelector("tbody");
    const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-admin-row]"));
    const normalizedQuery = query.trim().toLowerCase();
    const sortedRows = rows.sort((a, b) => {
      const left = a.dataset.sortText ?? a.textContent ?? "";
      const right = b.dataset.sortText ?? b.textContent ?? "";
      return sort === "za" ? right.localeCompare(left, "nl") : left.localeCompare(right, "nl");
    });
    let matching = 0;

    if (tbody) {
      for (const row of sortedRows) {
        tbody.append(row);
      }
    }

    for (const row of sortedRows) {
      const rowText = (row.dataset.searchText ?? row.textContent ?? "").toLowerCase();
      const rowStatus = row.dataset.status ?? "";
      const matchesSearch = !normalizedQuery || rowText.includes(normalizedQuery);
      const matchesStatus = !status || rowStatus === status;
      const matches = matchesSearch && matchesStatus;
      matching += matches ? 1 : 0;
      const rowPage = Math.ceil(matching / pageSize);
      row.hidden = !matches || rowPage !== page;
    }

    setVisibleCount(matching);
  }, [page, query, sort, status, rowCount]);

  useEffect(() => {
    setPage(1);
  }, [query, sort, status]);

  return (
    <div className="grid min-w-0 max-w-full gap-3" ref={rootRef}>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-muted/35 p-3">
        <label className="grid min-w-[220px] flex-1 gap-1 text-xs font-semibold text-muted-foreground">
          <span>Zoeken</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className={fieldClassName} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek in deze lijst" type="search" value={query} />
          </span>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          <span>Status</span>
          <select className={selectClassName} onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">Alle statussen</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          <span>Sortering</span>
          <select className={selectClassName} onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
        </label>
        <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
          {sort === "az" ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
          {visibleCount}/{rowCount}
        </div>
      </div>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Pagina {page} van {totalPages}
        </span>
        <div className="flex gap-2">
          <button className={buttonClassName} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
            Vorige
          </button>
          <button className={buttonClassName} disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">
            Volgende
          </button>
        </div>
      </div>
    </div>
  );
}

function collectStatusOptions(root: HTMLDivElement | null) {
  if (!root) {
    return [];
  }

  return [...new Set(Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-status]")).map((row) => row.dataset.status).filter(Boolean) as string[])].sort();
}

const fieldClassName = "h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const selectClassName = "h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const buttonClassName = "rounded-xl border border-border bg-background px-3 py-2 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50";

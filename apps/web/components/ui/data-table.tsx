"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Eye, FilterX, Loader2, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { showUndoToast } from "@/components/ui/undo-toast";
import { applyBulkStatusAction, undoBulkStatusAction } from "@/lib/ui/bulk-status-actions";
import { deleteSavedViewAction, listSavedViewsAction, saveSavedViewAction } from "@/lib/ui/saved-view-actions";
import type { SavedView } from "@/lib/ui/saved-view-contract";
import { cn } from "@/lib/utils";

export type DataTableFilter = { column: string; label: string; options: Array<{ label: string; value: string }> };
export type DataTableBulkResult = { description?: string; title?: string; undo?: () => void | Promise<void> };
export type DataTableBulkAction<TData> = { confirm?: string; label: string; onSelect: (rows: TData[]) => void | DataTableBulkResult | Promise<void | DataTableBulkResult>; tone?: "default" | "danger" };

export function DataTable<TData>({
  bulkActions = [],
  columns,
  data,
  detailDescription,
  detailTitle,
  emptyMessage = "Geen resultaten voor deze selectie.",
  filters = [],
  getRowId,
  initialSearchValue,
  initialPageSize = 20,
  renderDetails,
  searchColumn,
  searchPlaceholder = "Zoeken…",
  storageKey
}: {
  bulkActions?: DataTableBulkAction<TData>[];
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  detailDescription?: (row: TData) => string | undefined;
  detailTitle?: (row: TData) => string;
  emptyMessage?: string;
  filters?: DataTableFilter[];
  getRowId?: (row: TData, index: number) => string;
  initialSearchValue?: string;
  initialPageSize?: number;
  renderDetails?: (row: TData) => ReactNode;
  searchColumn?: string;
  searchPlaceholder?: string;
  storageKey?: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => searchColumn && initialSearchValue ? [{ id: searchColumn, value: initialSearchValue }] : []);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: initialPageSize });
  const [detailRow, setDetailRow] = useState<TData | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [viewDefault, setViewDefault] = useState(false);
  const [viewPopoverOpen, setViewPopoverOpen] = useState(false);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    setViewsLoading(true);
    void listSavedViewsAction(storageKey).then((result) => {
      if (!active) return;
      setViewsLoading(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSavedViews(result.views);
      const defaultView = result.views.find((view) => view.isDefault);
      if (defaultView) applyView(defaultView);
    });
    return () => { active = false; };
    // Apply the server default only when the resource changes, not after every
    // table-state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const selectionColumn = useMemo<ColumnDef<TData, unknown>>(() => ({
    id: "select",
    header: ({ table }) => <Checkbox aria-label="Alle zichtbare rijen selecteren" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false} onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))} />,
    cell: ({ row }) => <Checkbox aria-label="Rij selecteren" checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(Boolean(value))} onClick={(event) => event.stopPropagation()} />,
    enableHiding: false,
    enableSorting: false
  }), []);

  const detailColumn = useMemo<ColumnDef<TData, unknown>>(() => ({
    id: "details",
    header: () => <span className="sr-only">Details</span>,
    cell: ({ row }) => <Button aria-label="Details openen" onClick={() => setDetailRow(row.original)} size="icon" variant="ghost"><Eye className="size-4" aria-hidden="true" /></Button>,
    enableHiding: false,
    enableSorting: false
  }), []);

  const generatedBulkActions = useMemo(() => createStatusBulkActions<TData>(storageKey, router), [router, storageKey]);
  const effectiveBulkActions = bulkActions.length ? bulkActions : generatedBulkActions;
  const resolvedColumns = useMemo(() => [...(effectiveBulkActions.length ? [selectionColumn] : []), ...columns, ...(renderDetails ? [detailColumn] : [])], [columns, detailColumn, effectiveBulkActions.length, renderDetails, selectionColumn]);
  const table = useReactTable({
    columns: resolvedColumns,
    data,
    enableRowSelection: effectiveBulkActions.length > 0,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, pagination, rowSelection, sorting }
  });
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const hasFilters = columnFilters.length > 0;

  async function saveCurrentView() {
    if (!storageKey) return;
    setViewsLoading(true);
    const result = await saveSavedViewAction({
      name: viewName,
      isDefault: viewDefault,
      resourceKey: storageKey,
      state: { sorting, filters: columnFilters, visibility: columnVisibility }
    });
    setViewsLoading(false);
    if (!result.ok) return toast.error(result.error);
    setSavedViews(result.views);
    setViewName("");
    setViewDefault(false);
    setViewPopoverOpen(false);
    toast.success("Weergave opgeslagen");
  }

  function applyView(view: SavedView) {
    setSorting(view.state.sorting);
    setColumnFilters(view.state.filters as ColumnFiltersState);
    setColumnVisibility(view.state.visibility);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  async function deleteView(view: SavedView) {
    if (!storageKey) return;
    setViewsLoading(true);
    const result = await deleteSavedViewAction({ id: view.id, resourceKey: storageKey });
    setViewsLoading(false);
    if (!result.ok) return toast.error(result.error);
    setSavedViews(result.views);
    toast.success("Weergave verwijderd");
  }

  async function runBulkAction(action: DataTableBulkAction<TData>, targetRows = selectedRows) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBulkBusy(action.label);
    try {
      const result = await action.onSelect(targetRows);
      setRowSelection({});
      if (result?.undo) {
        showUndoToast({ description: result.description, onUndo: result.undo, title: result.title ?? "Bulkactie uitgevoerd" });
      } else {
        toast.success(result?.title ?? "Bulkactie uitgevoerd");
      }
    } catch {
      toast.error("De bulkactie is niet gelukt.");
    } finally {
      setBulkBusy(null);
    }
  }

  function openDetailsFromRow(event: KeyboardEvent<HTMLTableRowElement> | MouseEvent<HTMLTableRowElement>, row: TData) {
    if (!renderDetails) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [role=checkbox]")) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    if ("key" in event) event.preventDefault();
    setDetailRow(row);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {searchColumn ? <label className="relative block w-full xl:max-w-sm"><span className="sr-only">{searchPlaceholder}</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" placeholder={searchPlaceholder} value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""} onChange={(event) => table.getColumn(searchColumn)?.setFilterValue(event.target.value)} /></label> : null}
        <div className="flex flex-1 flex-wrap gap-2">
          {filters.map((filter) => {
            const column = table.getColumn(filter.column);
            if (!column) return null;
            return <Select key={filter.column} value={(column.getFilterValue() as string) || "__all"} onValueChange={(value) => column.setFilterValue(value === "__all" ? undefined : value)}><SelectTrigger aria-label={`Filter op ${filter.label}`} className="w-auto min-w-40"><SelectValue placeholder={filter.label} /></SelectTrigger><SelectContent><SelectItem value="__all">Alle {filter.label.toLowerCase()}</SelectItem>{filter.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
          })}
          {hasFilters ? <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost"><FilterX className="size-4" />Wis filters</Button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {storageKey ? <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Opgeslagen weergaven beheren" variant="outline">{viewsLoading ? <Loader2 className="size-4 animate-spin" /> : null}Weergaven<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-64"><DropdownMenuLabel>Opgeslagen weergaven</DropdownMenuLabel>{savedViews.length ? savedViews.map((view) => <div className="flex items-center gap-1 px-1" key={view.id}><button className="min-h-10 min-w-0 flex-1 rounded-lg px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => applyView(view)} type="button"><span className="block truncate">{view.name}</span>{view.isDefault ? <span className="text-[10px] text-muted-foreground">standaard</span> : null}</button><button aria-label={`${view.name} verwijderen`} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void deleteView(view)} type="button"><Trash2 className="size-4" /></button></div>) : <p className="px-2.5 py-2 text-xs text-muted-foreground">Nog geen presets</p>}<DropdownMenuSeparator /><Popover open={viewPopoverOpen} onOpenChange={setViewPopoverOpen}><PopoverTrigger asChild><button className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button"><Save className="size-4" />Huidige weergave opslaan</button></PopoverTrigger><PopoverContent align="end" className="grid gap-3"><label className="grid gap-1.5 text-sm font-semibold">Naam<Input autoFocus maxLength={80} onChange={(event) => setViewName(event.target.value)} placeholder="Bijv. open wachtlijst" value={viewName} /></label><label className="flex min-h-11 items-center gap-2 text-sm font-medium"><Checkbox checked={viewDefault} onCheckedChange={(value) => setViewDefault(Boolean(value))} />Als standaard openen</label><Button disabled={!viewName.trim() || viewsLoading} onClick={() => void saveCurrentView()}>{viewsLoading ? <Loader2 className="size-4 animate-spin" /> : null}Opslaan</Button></PopoverContent></Popover></DropdownMenuContent></DropdownMenu> : null}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Columns3 className="size-4" />Kolommen</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Toon kolommen</DropdownMenuLabel>{table.getAllColumns().filter((column) => column.getCanHide()).map((column) => <DropdownMenuCheckboxItem checked={column.getIsVisible()} key={column.id} onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}>{column.columnDef.meta && typeof column.columnDef.meta === "object" && "label" in column.columnDef.meta ? String(column.columnDef.meta.label) : column.id}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      {selectedRows.length && effectiveBulkActions.length ? <div aria-live="polite" className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-card/95 px-3 py-3 shadow-card backdrop-blur md:static md:rounded-xl md:bg-primary/5 md:shadow-none"><p className="mr-auto text-sm font-semibold">{selectedRows.length} geselecteerd</p>{effectiveBulkActions.map((action) => <Button className="min-h-11" disabled={Boolean(bulkBusy)} key={action.label} onClick={() => void runBulkAction(action)} size="sm" variant={action.tone === "danger" ? "destructive" : "outline"}>{bulkBusy === action.label ? <Loader2 className="size-4 animate-spin" /> : null}{action.label}</Button>)}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : header.column.getCanSort() ? "none" : undefined} key={header.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button className="flex min-h-11 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={header.column.getToggleSortingHandler()} type="button">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition", sorted === "asc" && "rotate-180", !sorted && "opacity-30")} />
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <TableRow className={cn(renderDetails && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")} data-state={row.getIsSelected() ? "selected" : undefined} key={row.id} onClick={(event) => openDetailsFromRow(event, row.original)} onKeyDown={(event) => openDetailsFromRow(event, row.original)} tabIndex={renderDetails ? 0 : undefined}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={resolvedColumns.length}>{emptyMessage}</TableCell></TableRow>}</TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <p className="flex-1">{table.getFilteredRowModel().rows.length} resultaten · pagina {table.getState().pagination.pageIndex + 1} van {Math.max(table.getPageCount(), 1)}</p>
        <Select value={String(pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}><SelectTrigger aria-label="Aantal resultaten per pagina" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} per pagina</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-1"><Button aria-label="Vorige pagina" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="icon" variant="outline"><ChevronLeft className="size-4" /></Button><Button aria-label="Volgende pagina" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="icon" variant="outline"><ChevronRight className="size-4" /></Button></div>
      </div>

      {detailRow && renderDetails ? <DetailsSheet description={detailDescription?.(detailRow)} onOpenChange={(open) => { if (!open) setDetailRow(null); }} open title={detailTitle?.(detailRow) ?? "Details"}><div className="grid gap-6">{renderDetails(detailRow)}{effectiveBulkActions.length ? <section className="rounded-2xl border border-border bg-muted/30 p-4"><h3 className="font-bold text-foreground">Snelle acties</h3><p className="mt-1 text-sm text-muted-foreground">Werk deze rij bij zonder het overzicht te verlaten.</p><div className="mt-3 flex flex-wrap gap-2">{effectiveBulkActions.map((action) => <Button className="min-h-11" disabled={Boolean(bulkBusy)} key={action.label} onClick={() => void runBulkAction(action, [detailRow])} variant={action.tone === "danger" ? "destructive" : "outline"}>{bulkBusy === action.label ? <Loader2 className="size-4 animate-spin" /> : null}{action.label}</Button>)}</div></section> : null}</div></DetailsSheet> : null}
    </div>
  );
}

export function dataTableTextFilter<TData>(row: Row<TData>, columnId: string, value: string) {
  return String(row.getValue(columnId) ?? "").toLocaleLowerCase("nl").includes(value.toLocaleLowerCase("nl"));
}

function createStatusBulkActions<TData>(storageKey: string | undefined, router: ReturnType<typeof useRouter>): DataTableBulkAction<TData>[] {
  const configurations = {
    "admin.documents": { options: [["Archiveren", "archived"], ["Herstellen", "active"]], resource: "documents" },
    "admin.groups": { options: [["Pauzeren", "paused"], ["Activeren", "active"]], resource: "groups" },
    "admin.intake": { options: [["In beoordeling", "reviewing"], ["Sluiten", "closed"]], resource: "intake" },
    "admin.students": { options: [["Pauzeren", "paused"], ["Activeren", "active"]], resource: "enrollments" },
    "admin.tasks": { options: [["Afronden", "done"], ["Heropenen", "open"]], resource: "tasks" }
  } as const;
  const configuration = storageKey ? configurations[storageKey as keyof typeof configurations] : undefined;
  if (!configuration) return [];

  return configuration.options.map(([label, status]) => ({
    confirm: `Weet je zeker dat je alle geselecteerde rijen wilt wijzigen naar ${status.replaceAll("_", " ")}?`,
    label,
    onSelect: async (rows) => {
      const ids = rows.map((row) => (row as { id?: unknown }).id).filter((id): id is string => typeof id === "string");
      const result = await applyBulkStatusAction({ ids, resource: configuration.resource, status });
      if (!result.ok) throw new Error(result.error);
      router.refresh();
      return {
        description: `${ids.length} rij${ids.length === 1 ? "" : "en"} bijgewerkt.`,
        title: `${label} voltooid`,
        undo: result.undoToken ? async () => {
          const undo = await undoBulkStatusAction(result.undoToken);
          if (!undo.ok) {
            toast.error(undo.error);
            return;
          }
          toast.success("Wijziging ongedaan gemaakt");
          router.refresh();
        } : undefined
      };
    },
    tone: status === "archived" || status === "closed" ? "danger" : "default"
  }));
}

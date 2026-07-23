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
import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Eye, FilterX, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableFilter = { column: string; label: string; options: Array<{ label: string; value: string }> };
export type DataTableBulkAction<TData> = { label: string; onSelect: (rows: TData[]) => void | Promise<void>; tone?: "default" | "danger" };

type StoredView = {
  name: string;
  sorting: SortingState;
  filters: ColumnFiltersState;
  visibility: VisibilityState;
};

export function DataTable<TData>({
  bulkActions = [],
  columns,
  data,
  detailDescription,
  detailTitle,
  emptyMessage = "Geen resultaten voor deze selectie.",
  filters = [],
  getRowId,
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
  initialPageSize?: number;
  renderDetails?: (row: TData) => ReactNode;
  searchColumn?: string;
  searchPlaceholder?: string;
  storageKey?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: initialPageSize });
  const [detailRow, setDetailRow] = useState<TData | null>(null);
  const [savedViews, setSavedViews] = useState<StoredView[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const value = window.localStorage.getItem(`nxttrack.views.${storageKey}`);
      if (value) setSavedViews(JSON.parse(value) as StoredView[]);
    } catch {
      setSavedViews([]);
    }
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

  const resolvedColumns = useMemo(() => [selectionColumn, ...columns, ...(renderDetails ? [detailColumn] : [])], [columns, detailColumn, renderDetails, selectionColumn]);
  const table = useReactTable({
    columns: resolvedColumns,
    data,
    enableRowSelection: true,
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

  function saveCurrentView() {
    if (!storageKey) return;
    const name = window.prompt("Naam van deze weergave");
    if (!name?.trim()) return;
    const next = [...savedViews.filter((view) => view.name !== name.trim()), { name: name.trim(), sorting, filters: columnFilters, visibility: columnVisibility }];
    setSavedViews(next);
    window.localStorage.setItem(`nxttrack.views.${storageKey}`, JSON.stringify(next));
  }

  function applyView(view: StoredView) {
    setSorting(view.sorting);
    setColumnFilters(view.filters);
    setColumnVisibility(view.visibility);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {searchColumn ? <label className="relative block w-full xl:max-w-sm"><span className="sr-only">{searchPlaceholder}</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" placeholder={searchPlaceholder} value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""} onChange={(event) => table.getColumn(searchColumn)?.setFilterValue(event.target.value)} /></label> : null}
        <div className="flex flex-1 flex-wrap gap-2">
          {filters.map((filter) => {
            const column = table.getColumn(filter.column);
            if (!column) return null;
            return <Select key={filter.column} value={(column.getFilterValue() as string) || "__all"} onValueChange={(value) => column.setFilterValue(value === "__all" ? undefined : value)}><SelectTrigger className="w-auto min-w-40"><SelectValue placeholder={filter.label} /></SelectTrigger><SelectContent><SelectItem value="__all">Alle {filter.label.toLowerCase()}</SelectItem>{filter.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
          })}
          {hasFilters ? <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost"><FilterX className="size-4" />Wis filters</Button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {storageKey ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Weergaven<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Opgeslagen weergaven</DropdownMenuLabel>{savedViews.length ? savedViews.map((view) => <button className="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted" key={view.name} onClick={() => applyView(view)} type="button">{view.name}</button>) : <p className="px-2.5 py-2 text-xs text-muted-foreground">Nog geen presets</p>}<DropdownMenuSeparator /><button className="block w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-muted" onClick={saveCurrentView} type="button">Huidige weergave opslaan</button></DropdownMenuContent></DropdownMenu> : null}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Columns3 className="size-4" />Kolommen</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Toon kolommen</DropdownMenuLabel>{table.getAllColumns().filter((column) => column.getCanHide()).map((column) => <DropdownMenuCheckboxItem checked={column.getIsVisible()} key={column.id} onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}>{column.columnDef.meta && typeof column.columnDef.meta === "object" && "label" in column.columnDef.meta ? String(column.columnDef.meta.label) : column.id}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      {selectedRows.length && bulkActions.length ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"><p className="mr-auto text-sm font-semibold">{selectedRows.length} geselecteerd</p>{bulkActions.map((action) => <Button key={action.label} onClick={() => void action.onSelect(selectedRows)} size="sm" variant={action.tone === "danger" ? "destructive" : "outline"}>{action.label}</Button>)}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id}>{header.isPlaceholder ? null : header.column.getCanSort() ? <button className="flex items-center gap-1 text-left" onClick={header.column.getToggleSortingHandler()} type="button">{flexRender(header.column.columnDef.header, header.getContext())}<ChevronDown className={cn("size-3.5 transition", header.column.getIsSorted() === "asc" && "rotate-180", !header.column.getIsSorted() && "opacity-30")} /></button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={resolvedColumns.length}>{emptyMessage}</TableCell></TableRow>}</TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <p className="flex-1">{table.getFilteredRowModel().rows.length} resultaten · pagina {table.getState().pagination.pageIndex + 1} van {Math.max(table.getPageCount(), 1)}</p>
        <Select value={String(pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} per pagina</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-1"><Button aria-label="Vorige pagina" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="icon" variant="outline"><ChevronLeft className="size-4" /></Button><Button aria-label="Volgende pagina" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="icon" variant="outline"><ChevronRight className="size-4" /></Button></div>
      </div>

      {detailRow && renderDetails ? <DetailsSheet description={detailDescription?.(detailRow)} onOpenChange={(open) => { if (!open) setDetailRow(null); }} open title={detailTitle?.(detailRow) ?? "Details"}>{renderDetails(detailRow)}</DetailsSheet> : null}
    </div>
  );
}

export function dataTableTextFilter<TData>(row: Row<TData>, columnId: string, value: string) {
  return String(row.getValue(columnId) ?? "").toLocaleLowerCase("nl").includes(value.toLocaleLowerCase("nl"));
}

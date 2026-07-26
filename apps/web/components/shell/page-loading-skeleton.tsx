import { Skeleton } from "@/components/ui/skeleton";

export function PageLoadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Pagina wordt geladen" className="space-y-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: compact ? 2 : 4 }, (_, index) => <div className="rounded-2xl border border-border bg-card p-4" key={index}><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-8 w-20" /></div>)}
      </div>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-3 xl:flex-row">
          <Skeleton className="h-11 w-full xl:max-w-sm" />
          <Skeleton className="h-11 w-44" />
          <Skeleton className="h-11 w-36 xl:ml-auto" />
        </div>
        <div className="mt-5 grid gap-3">
          {Array.from({ length: compact ? 4 : 7 }, (_, index) => <div className="grid grid-cols-[32px_minmax(120px,1.4fr)_minmax(90px,1fr)_100px] items-center gap-4 border-b border-border py-3 last:border-0" key={index}><Skeleton className="size-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-7 rounded-full" /></div>)}
        </div>
      </div>
      <span className="sr-only">Gegevens worden opgehaald.</span>
    </div>
  );
}

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";

export function RoutePlaceholder({
  kicker,
  title,
  description,
  items
}: {
  kicker: string;
  title: string;
  description: string;
  items?: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} subtitle={description} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Skeleton state</h2>
            <StatusPill tone="info">Phase 2</StatusPill>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Deze route bestaat zodat navigatie, shell-layout, deployment en visuele tokens gevalideerd kunnen worden. Echte domeindata volgt pas in latere fases.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Nog niet actief</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {(items ?? ["Auth", "Tenantdata", "Supabase", "Productlogica"]).map((item) => (
              <li key={item} className="rounded-xl bg-muted px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

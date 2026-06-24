import { Card, PageHeader, StatusPill } from "@/components/shell/ui";

export function RoutePlaceholder({
  kicker,
  title,
  description,
  items,
  status = "Voorbereid"
}: {
  kicker: string;
  title: string;
  description: string;
  items?: string[];
  status?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} subtitle={description} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden lg:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Placeholder met Lovable-stijl</h2>
            <StatusPill tone="info">{status}</StatusPill>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Deze pagina is bewust netjes vormgegeven, ook zolang nog niet alle echte productdata beschikbaar is. Zo blijft de omgeving bruikbaar en consistent met de Lovable-richting.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Onderdelen</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {(items ?? ["Navigatie", "Tenantdata", "Rechten", "Productlogica"]).map((item) => (
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

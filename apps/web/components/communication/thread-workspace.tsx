import { Clock3, LockKeyhole, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";

import {
  ThreadManagementForm,
  ThreadReplyForm
} from "@/components/communication/communication-forms";
import { Button } from "@/components/ui/button";
import { createTaskFromThreadAction, markMessageThreadReadAction } from "@/lib/domain/communication-hub-actions";
import {
  threadStatusLabels,
  threadTypeLabels,
  type ThreadStatus,
  type ThreadType
} from "@/lib/domain/communication-hub-contract";
import type {
  CommunicationPersonOption,
  MessageThreadRow,
  ThreadMessageRow
} from "@/lib/domain/communication-hub";
import { cn } from "@/lib/utils";

export function ThreadWorkspace({
  baseHref,
  canReply = true,
  currentUserId,
  filterAssignees = [],
  filters,
  instructors = [],
  messages,
  mode,
  people,
  selectedThreadId,
  staff = [],
  threads,
  unreadThreadIds = []
}: {
  baseHref: string;
  canReply?: boolean;
  currentUserId?: string;
  filterAssignees?: CommunicationPersonOption[];
  filters?: { assigned: string; query: string; status: string; type: string };
  instructors?: CommunicationPersonOption[];
  messages: ThreadMessageRow[];
  mode: "admin" | "parent" | "instructor";
  people: Map<string, CommunicationPersonOption>;
  selectedThreadId?: string | null;
  staff?: CommunicationPersonOption[];
  threads: MessageThreadRow[];
  unreadThreadIds?: string[];
}) {
  const selected =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const selectedMessages = selected
    ? messages.filter((message) => message.thread_id === selected.id && message.status !== "deleted")
    : [];
  const canWriteInternal =
    mode === "admin" ||
    (
      mode === "instructor" &&
      Boolean(currentUserId) &&
      (
        selected?.assigned_instructor_user_id === currentUserId ||
        selected?.assigned_staff_user_id === currentUserId
      )
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="grid min-h-[620px] xl:grid-cols-[minmax(300px,0.85fr)_minmax(520px,1.6fr)]">
        <div className="border-b border-border xl:border-b-0 xl:border-r">
          <header className="border-b border-border bg-muted/35 px-4 py-4">
            <h2 className="font-bold text-foreground">Gesprekken</h2>
            <p className="mt-1 text-xs text-muted-foreground">{threads.length} tenant-veilig {threads.length === 1 ? "gesprek" : "gesprekken"}</p>
          </header>
          {mode === "admin" ? (
            <form action={baseHref} className="grid gap-2 border-b border-border bg-card p-3" method="get">
              <label className="sr-only" htmlFor="thread-search">Zoek gesprekken</label>
              <input className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm" defaultValue={filters?.query} id="thread-search" name="q" placeholder="Zoek onderwerp of ouder…" />
              <div className="grid grid-cols-3 gap-2">
                <select aria-label="Filter op status" className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs" defaultValue={filters?.status} name="threadStatus">
                  <option value="">Alle statussen</option>
                  {Object.entries(threadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter op type" className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs" defaultValue={filters?.type} name="threadType">
                  <option value="">Alle types</option>
                  {Object.entries(threadTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter op behandelaar" className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs" defaultValue={filters?.assigned} name="assigned">
                  <option value="">Alle behandelaren</option>
                  <option value="unassigned">Niet toegewezen</option>
                  {filterAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" size="sm" type="submit">Filter toepassen</Button>
                <Link className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted" href={baseHref}>Wissen</Link>
              </div>
            </form>
          ) : null}
          {threads.length ? (
            <div aria-label="Gesprekkenlijst" className="max-h-[560px] overflow-y-auto" role="list">
              {threads.map((thread) => {
                const active = thread.id === selected?.id;
                const guardian = thread.guardian_user_id ? people.get(thread.guardian_user_id) : null;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block border-b border-border px-4 py-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active ? "bg-primary/7" : "hover:bg-muted/45"
                    )}
                    href={`${baseHref}?thread=${thread.id}`}
                    key={thread.id}
                    role="listitem"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-sm font-bold text-foreground">{thread.subject}</p>
                      <span className={cn("mt-1 size-2 shrink-0 rounded-full", unreadThreadIds.includes(thread.id) ? "bg-danger" : thread.status === "waiting_for_school" ? "bg-warning" : thread.status === "closed" ? "bg-muted-foreground/40" : "bg-primary")} />
                    </div>
                    {unreadThreadIds.includes(thread.id) ? <span className="sr-only">Ongelezen gesprek</span> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-1">{threadTypeLabel(thread.thread_type)}</span>
                      <span className="rounded-full bg-muted px-2 py-1">{threadStatusLabel(thread.status)}</span>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">{guardian?.name ?? "Nog geen ouder gekoppeld"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(thread.last_message_at ?? thread.created_at)}</p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center p-6 text-center">
              <div>
                <MessageCircle className="mx-auto size-8 text-primary" />
                <p className="mt-3 font-semibold text-foreground">Nog geen gesprekken</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Start een nieuw gesprek om communicatie rond een leerling of proces centraal vast te leggen.</p>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <>
              <header className="border-b border-border bg-card px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{threadTypeLabel(selected.thread_type)}</p>
                    <h2 className="mt-1 text-xl font-bold text-foreground">{selected.subject}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Laatste activiteit {formatDate(selected.last_message_at ?? selected.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold">{threadStatusLabel(selected.status)}</span>
                    {unreadThreadIds.includes(selected.id) ? (
                      <form action={markMessageThreadReadAction}>
                        <input name="threadId" type="hidden" value={selected.id} />
                        <input name="next" type="hidden" value={`${baseHref}?thread=${selected.id}`} />
                        <Button size="sm" type="submit" variant="outline">Markeer gelezen</Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </header>

              <div aria-label={`Berichten in ${selected.subject}`} className="max-h-[440px] space-y-3 overflow-y-auto bg-muted/20 px-4 py-5 sm:px-5" role="log">
                {selectedMessages.length ? selectedMessages.map((message) => {
                  const sender = message.sender_user_id ? people.get(message.sender_user_id) : null;
                  const internal = message.visibility !== "public_to_thread";
                  const ownSide =
                    (mode === "parent" && message.sender_type === "parent") ||
                    (mode === "instructor" && message.sender_type === "instructor") ||
                    (mode === "admin" && message.sender_type === "staff");
                  return (
                    <article className={cn("flex", ownSide && "justify-end")} key={message.id}>
                      <div className={cn(
                        "max-w-[min(88%,680px)] rounded-2xl border px-4 py-3 shadow-soft",
                        internal
                          ? "border-warning/25 bg-warning/10"
                          : ownSide
                            ? "border-primary/20 bg-primary/10"
                            : "border-border bg-card"
                      )}>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {internal ? <LockKeyhole className="size-3.5 text-warning" /> : <UserRound className="size-3.5" />}
                          <span className="font-semibold text-foreground">{sender?.name ?? senderLabel(message.sender_type)}</span>
                          <span>·</span>
                          <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                          {internal ? <span className="rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning">{message.visibility === "internal_note" ? "interne notitie" : "alleen team"}</span> : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{message.plain_text}</p>
                        {message.content_classification === "sensitive" || message.content_classification === "restricted" ? (
                          <p className="mt-2 text-xs font-semibold text-danger">Gevoelige inhoud — controleer delen en bewaartermijn.</p>
                        ) : null}
                      </div>
                    </article>
                  );
                }) : (
                  <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nog geen berichten in dit gesprek.</p>
                )}
              </div>

              <div className="grid gap-5 border-t border-border p-4 sm:p-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <section>
                  <h3 className="text-sm font-bold text-foreground">{mode === "admin" ? "Antwoord of interne notitie" : "Antwoorden"}</h3>
                  <p className="mt-1 mb-3 text-xs leading-5 text-muted-foreground">Verzending is altijd een handmatige, bevestigde actie.</p>
                  <ThreadReplyForm allowInternal={canWriteInternal} canReply={canReply} next={`${baseHref}?thread=${selected.id}`} threadId={selected.id} />
                </section>
                {mode === "admin" ? (
                  <aside className="space-y-4 border-t border-border pt-4 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Regie</h3>
                      <p className="mt-1 mb-3 text-xs leading-5 text-muted-foreground">Toewijzing en status wijzigen zonder contextverlies.</p>
                      <ThreadManagementForm instructors={instructors} next={`${baseHref}?thread=${selected.id}`} staff={staff} thread={selected} />
                    </div>
                    <form action={createTaskFromThreadAction}>
                      <input name="threadId" type="hidden" value={selected.id} />
                      <input name="next" type="hidden" value={`${baseHref}?thread=${selected.id}`} />
                      <input name="humanConfirmation" type="hidden" value="confirmed" />
                      <Button className="w-full" type="submit" variant="outline">
                        <Clock3 className="size-4" />
                        Maak opvolgtaak
                      </Button>
                    </form>
                  </aside>
                ) : null}
              </div>
            </>
          ) : (
            <div className="grid min-h-[620px] place-items-center p-8 text-center">
              <div>
                <MessageCircle className="mx-auto size-10 text-primary" />
                <h2 className="mt-4 text-lg font-bold text-foreground">Kies of start een gesprek</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Alle context, reacties en interne opvolging blijven bij elkaar en binnen de huidige organisatie.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function threadTypeLabel(value: string) {
  return threadTypeLabels[value as ThreadType] ?? value.replaceAll("_", " ");
}

function threadStatusLabel(value: string) {
  return threadStatusLabels[value as ThreadStatus] ?? value.replaceAll("_", " ");
}

function senderLabel(value: string) {
  if (value === "parent") return "Ouder/verzorger";
  if (value === "instructor") return "Instructeur";
  if (value === "staff") return "Zwemschool";
  return "NXTTRACK";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

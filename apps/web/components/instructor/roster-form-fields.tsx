import { ClipboardCheck, MessageSquarePlus } from "lucide-react";

export const attendanceLabels = {
  present: "Aanwezig",
  absent: "Afwezig",
  late: "Laat",
  excused: "Afmelding",
  trial: "Proefles"
} as const;

export function RosterAttendanceFields({ participantName, status, note }: {
  participantName: string;
  status: string;
  note: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
      <select aria-label={`Aanwezigheidsstatus van ${participantName}`} className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={status} name="status">
        {Object.entries(attendanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input aria-label={`Lesnotitie voor ${participantName}`} className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={note} name="note" placeholder="Korte lesnotitie" />
      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
        <ClipboardCheck className="h-4 w-4" />
        Opslaan
      </button>
    </div>
  );
}

export function FocusNoteFields({ id, participantName }: { id: string; participantName: string }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>Interne notitie voor {participantName}</label>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm" id={id} name="note" placeholder="Korte interne notitie" required />
        <button aria-label={`Notitie toevoegen voor ${participantName}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground" type="submit"><MessageSquarePlus className="size-4" /></button>
      </div>
    </>
  );
}

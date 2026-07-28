"use client";

import { BellRing, BellOff, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  configured: boolean;
  enabled: boolean;
  preferences: { lessonChanges: boolean; newMessages: boolean; reminders: boolean };
  publicKey: string;
};

export function WebPushSettings({ configured, enabled: initiallyEnabled, preferences: initialPreferences, publicKey }: Props) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enable() {
    setBusy(true); setMessage(null);
    try {
      if (!configured || !publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Pushmeldingen zijn op dit apparaat of in deze omgeving nog niet beschikbaar.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Je browser heeft geen toestemming voor meldingen.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      const response = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), preferences }) });
      if (!response.ok) throw new Error("De voorkeuren konden niet veilig worden opgeslagen.");
      setEnabled(true); setMessage("Pushmeldingen zijn ingeschakeld op dit apparaat.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inschakelen is niet gelukt."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage(null);
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      const response = await fetch("/api/push/subscription", { method: "DELETE" });
      if (!response.ok) throw new Error("Uitschakelen is niet gelukt.");
      setEnabled(false); setMessage("Pushmeldingen zijn op dit account uitgeschakeld.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Uitschakelen is niet gelukt."); }
    finally { setBusy(false); }
  }

  async function saveOrTest(test = false) {
    setBusy(true); setMessage(null);
    try {
      if (test) {
        const response = await fetch("/api/push/test", { method: "POST" });
        if (!response.ok) throw new Error("De testmelding kon niet worden bezorgd.");
        setMessage("Testmelding verstuurd.");
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("Schakel meldingen eerst opnieuw in.");
        const response = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), preferences }) });
        if (!response.ok) throw new Error("Opslaan is niet gelukt.");
        setMessage("Meldingsvoorkeuren opgeslagen.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Actie niet gelukt."); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Web-push</p><h2 className="mt-2 text-xl font-bold">Directe, veilige updates</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Ontvang alleen de gekozen servicemeldingen. Geen marketing, geen kindgegevens in het vergrendelscherm en op ieder moment weer uit te zetten.</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success"><ShieldCheck className="size-4" /> Expliciete toestemming per apparaat</div></div>
      <div className="space-y-3">
        {!configured ? <p className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm font-semibold text-warning">De zwemschool heeft web-push nog niet technisch geactiveerd.</p> : null}
        {enabled ? <>
          <Toggle checked={preferences.lessonChanges} label="Leswijzigingen en annuleringen" onChange={(value) => setPreferences((current) => ({ ...current, lessonChanges: value }))} />
          <Toggle checked={preferences.newMessages} label="Nieuwe beveiligde berichten" onChange={(value) => setPreferences((current) => ({ ...current, newMessages: value }))} />
          <Toggle checked={preferences.reminders} label="Behulpzame lesherinneringen" onChange={(value) => setPreferences((current) => ({ ...current, reminders: value }))} />
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void saveOrTest(false)}>{busy ? "Bezig…" : "Voorkeuren opslaan"}</Button><Button disabled={busy} onClick={() => void saveOrTest(true)} variant="outline"><Send className="size-4" /> Testmelding</Button><Button disabled={busy} onClick={() => void disable()} variant="ghost"><BellOff className="size-4" /> Uitschakelen</Button></div>
        </> : <Button disabled={busy || !configured} onClick={() => void enable()}><BellRing className="size-4" /> {busy ? "Bezig…" : "Pushmeldingen inschakelen"}</Button>}
        {message ? <p aria-live="polite" className="text-sm font-semibold text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm font-bold"><span>{label}</span><input checked={checked} className="size-5 accent-primary" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>; }
function decodeKey(value: string) { const padding = "=".repeat((4 - (value.length % 4)) % 4); const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }

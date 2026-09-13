"use client";

import { Award, CalendarDays, Home, LogOut, Map, UserRound, Volume2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { returnToParentPortalAction } from "@/lib/auth/portal-session-actions";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/kind", label: "Vandaag", icon: Home, exact: true },
  { href: "/kind/reis", label: "Mijn reis", icon: Map },
  { href: "/kind/badges", label: "Badges", icon: Award },
  { href: "/kind/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/kind/ik", label: "Ik", icon: UserRound }
] as const;

export function ChildPortalShell({
  children,
  childName,
  logoUrl,
  tenantName,
  themeName,
  readAloudEnabled,
  sessionExpiresAt,
  soundEnabled
}: {
  children: ReactNode;
  childName: string;
  logoUrl: string | null;
  tenantName: string;
  themeName: string;
  readAloudEnabled: boolean;
  sessionExpiresAt: string;
  soundEnabled: boolean;
}) {
  const pathname = usePathname();
  const [speechAvailable, setSpeechAvailable] = useState(false);
  useEffect(() => {
    setSpeechAvailable("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
  }, []);
  useEffect(() => {
    const delay = Math.max(0, new Date(sessionExpiresAt).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      lockForParentReauthentication();
      window.location.replace("/login?error=child_session_locked");
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [sessionExpiresAt]);
  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const response = await fetch("/api/child/session", { cache: "no-store", credentials: "same-origin" });
        if (!active || response.status === 204) return;
      } catch {
        if (!active || !navigator.onLine) return;
      }
      lockForParentReauthentication();
      window.location.replace("/login?error=child_session_locked");
    };
    const interval = window.setInterval(() => { void verify(); }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void verify(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("nxttrack.portal-session") : null;
    const hideAndReplace = (mode: unknown) => {
      if (mode !== "parent" && mode !== "locked") return;
      if (document.documentElement.dataset.portalSessionTransition === "true") return;
      document.documentElement.dataset.portalSessionTransition = "true";
      window.location.replace(mode === "parent" ? "/portaal" : "/login?error=child_session_locked");
    };
    const onMessage = (event: MessageEvent) => hideAndReplace((event.data as { mode?: unknown } | null)?.mode);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "nxttrack.portal-session.mode" || !event.newValue) return;
      try { hideAndReplace((JSON.parse(event.newValue) as { mode?: unknown }).mode); } catch { /* server guard remains authoritative */ }
    };
    channel?.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    const state = JSON.stringify({ mode: "child", changedAt: Date.now() });
    window.localStorage.setItem("nxttrack.portal-session.mode", state);
    channel?.postMessage({ mode: "child" });
    void navigator.serviceWorker?.ready.then(async (registration) => {
      registration.active?.postMessage({ type: "PORTAL_MODE", mode: "child" });
      const notifications = await registration.getNotifications();
      notifications.forEach((notification) => notification.close());
    });
    delete document.documentElement.dataset.portalSessionTransition;
    return () => {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if (!soundEnabled || !document.querySelector('[data-celebration="open"]')) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const audio = new AudioContextConstructor();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.setValueAtTime(523.25, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(783.99, audio.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.24);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.25);
    return () => { void audio.close(); };
  }, [pathname, soundEnabled]);

  function readPageAloud() {
    if (!speechAvailable) return;
    window.speechSynthesis.cancel();
    const text = document.querySelector(".child-shell__main")?.textContent?.replace(/\s+/g, " ").trim();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.lang = "nl-NL";
    window.speechSynthesis.speak(utterance);
  }
  function lockForParentReauthentication() {
    document.documentElement.dataset.portalSessionTransition = "true";
    const state = JSON.stringify({ mode: "locked", changedAt: Date.now() });
    window.localStorage.setItem("nxttrack.portal-session.mode", state);
    void navigator.serviceWorker?.ready.then((registration) => {
      registration.active?.postMessage({ type: "PORTAL_MODE", mode: "locked" });
    });
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("nxttrack.portal-session");
      channel.postMessage({ mode: "locked" });
      channel.close();
    }
  }
  return (
    <div className="child-shell">
      <header className="child-shell__header">
        <Link className="child-shell__brand" href="/kind">
          <span aria-hidden="true">{logoUrl ? <img alt="" src={logoUrl} /> : "NXT"}</span>
          <span><strong>{tenantName}</strong><small>{themeName} · Kinderportaal</small></span>
        </Link>
        <div className="child-shell__mode" role="status">
          <span aria-hidden="true">★</span>
          Kindmodus · {childName}
        </div>
        <div className="child-shell__actions">
          {readAloudEnabled && speechAvailable ? <button aria-label="Lees deze pagina voor" className="child-shell__read" onClick={readPageAloud} type="button"><Volume2 aria-hidden="true" /><span>Lees voor</span></button> : null}
          <span aria-label={`Kindprofiel van ${childName}`} className="child-shell__avatar">{childName.charAt(0).toUpperCase()}</span>
          <form action={returnToParentPortalAction} onSubmit={lockForParentReauthentication}>
            <button aria-label="Naar ouderportaal" className="child-shell__exit" type="submit">
              <LogOut aria-hidden="true" />
              <span>Naar ouderportaal</span>
            </button>
          </form>
        </div>
      </header>

      <aside aria-label="Kindportaal" className="child-shell__sidebar">
        <p>Mijn plek</p>
        <nav>
          {navigation.map((item) => {
            const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return <Link aria-current={active ? "page" : undefined} className={cn(active && "is-active")} href={item.href} key={item.href}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>;
          })}
        </nav>
        <div className="child-shell__safe-note">
          <strong>Veilige kindmodus</strong>
          <span>Alleen jouw reis, lessen en behaalde momenten.</span>
        </div>
      </aside>

      <main className="child-shell__main">{children}</main>

      <nav aria-label="Kindportaal" className="child-shell__bottom-nav">
        {navigation.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link aria-current={active ? "page" : undefined} className={cn(active && "is-active")} href={item.href} key={item.href}>
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>;
        })}
      </nav>
    </div>
  );
}

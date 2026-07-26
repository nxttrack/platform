"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function PwaRegister() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online ? null : <div aria-live="assertive" className="fixed inset-x-3 bottom-3 z-[100] flex items-center justify-center gap-2 rounded-xl border border-warning/30 bg-card px-4 py-3 text-sm font-bold text-foreground shadow-card sm:left-auto"><WifiOff className="size-4 text-warning" />Offline: opgeslagen gegevens blijven privé; wijzigingen wachten op verbinding.</div>;
}

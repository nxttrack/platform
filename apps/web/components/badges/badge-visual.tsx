import {
  Activity,
  ArrowRight,
  Award,
  CalendarCheck,
  CalendarPlus,
  CircleDot,
  Cloud,
  Crown,
  Droplets,
  Dumbbell,
  Ear,
  Eye,
  Flame,
  Footprints,
  GraduationCap,
  HandHeart,
  Heart,
  LockKeyhole,
  Medal,
  Moon,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
  Waves,
  Wind,
  Zap,
  type LucideIcon
} from "lucide-react";

import { StatusPill } from "@/components/shell/ui";
import { cn } from "@/lib/utils";

export function BadgeVisual({
  artworkUrl,
  category,
  className,
  description,
  earned = false,
  iconName,
  locked = false,
  name,
  surprise = false
}: {
  artworkUrl?: string | null;
  category?: string;
  className?: string;
  description?: string | null;
  earned?: boolean;
  iconName?: string | null;
  locked?: boolean;
  name: string;
  surprise?: boolean;
}) {
  const Icon = badgeIcon(iconName, surprise);
  return (
    <article className={cn(
      "group relative overflow-hidden rounded-3xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card",
      earned ? "border-emerald-200/80" : "border-border",
      locked && "border-dashed opacity-80",
      className
    )}>
      <div aria-hidden="true" className="absolute -right-8 -top-8 size-28 rounded-full bg-aqua/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className={cn(
          "grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-white shadow-glow",
          earned ? "bg-gradient-to-br from-primary via-sky-500 to-aqua" : "bg-gradient-to-br from-slate-300 to-slate-500"
        )}>
          {locked ? <LockKeyhole className="size-6" /> : artworkUrl ? (
            // Badge artwork is served through the authenticated private-file proxy.
            <img alt="" className="size-full object-contain" src={artworkUrl} />
          ) : <Icon className="size-7" />}
        </div>
        <StatusPill tone={earned ? "success" : locked ? "neutral" : "info"}>
          {earned ? "Behaald" : locked ? "Verborgen" : category?.replaceAll("_", " ") ?? "Badge"}
        </StatusPill>
      </div>
      <h3 className="relative mt-5 text-lg font-bold tracking-tight text-foreground">{locked ? "Verrassingsbadge" : name}</h3>
      <p className="relative mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {locked ? "Blijf met plezier oefenen om deze verrassing te ontdekken." : description || "Een mooie stap in de zwemreis."}
      </p>
    </article>
  );
}

const badgeIcons: Record<string, LucideIcon> = {
  activity: Activity,
  "arrow-right": ArrowRight,
  award: Award,
  "calendar-check": CalendarCheck,
  "calendar-plus": CalendarPlus,
  "circle-dot": CircleDot,
  cloud: Cloud,
  crown: Crown,
  droplets: Droplets,
  dumbbell: Dumbbell,
  ear: Ear,
  eye: Eye,
  flame: Flame,
  footprints: Footprints,
  "graduation-cap": GraduationCap,
  "hand-heart": HandHeart,
  heart: Heart,
  medal: Medal,
  moon: Moon,
  "refresh-cw": RefreshCw,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  target: Target,
  trophy: Trophy,
  waves: Waves,
  wind: Wind,
  zap: Zap
};

export const badgeIconOptions = [
  ["award", "Award"],
  ["waves", "Golven"],
  ["droplets", "Druppels"],
  ["calendar-check", "Aanwezigheid"],
  ["calendar-plus", "Les plannen"],
  ["medal", "Medaille"],
  ["trophy", "Trofee"],
  ["flame", "Streak"],
  ["sparkles", "Sprankels"],
  ["footprints", "Stappen"],
  ["heart", "Hart"],
  ["eye", "Kijken"],
  ["zap", "Energie"],
  ["star", "Ster"],
  ["activity", "Techniek"],
  ["wind", "Adem"],
  ["shield", "Schild"],
  ["arrow-right", "Volgende stap"],
  ["moon", "Maan"],
  ["graduation-cap", "Diploma"],
  ["crown", "Kroon"],
  ["refresh-cw", "Inhalen"],
  ["sun", "Zon"],
  ["ear", "Luisteren"],
  ["target", "Focus"],
  ["hand-heart", "Helpen"],
  ["cloud", "Drijven"],
  ["circle-dot", "Bellen"],
  ["dumbbell", "Kracht"]
] as const;

function badgeIcon(name: string | null | undefined, surprise: boolean) {
  return badgeIcons[name ?? ""] ?? (surprise ? Sparkles : Award);
}

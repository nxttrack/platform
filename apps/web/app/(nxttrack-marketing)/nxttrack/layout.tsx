import type { ReactNode } from "react";

import { PublicAnalytics } from "@/components/analytics/public-analytics";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/marketing/site-chrome";

export default function NxttrackMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased [font-feature-settings:'cv11']">
      <MarketingSiteHeader />
      <main>{children}</main>
      <MarketingSiteFooter />
      <PublicAnalytics measurementId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} />
    </div>
  );
}

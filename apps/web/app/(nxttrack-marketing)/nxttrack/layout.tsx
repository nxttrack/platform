import type { ReactNode } from "react";

import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/marketing/site-chrome";

export default function NxttrackMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased [font-feature-settings:'cv11']">
      <MarketingSiteHeader />
      <main>{children}</main>
      <MarketingSiteFooter />
    </div>
  );
}

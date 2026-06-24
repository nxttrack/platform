import type { Metadata } from "next";
import { NxttrackMarketingPage as LovableNxttrackMarketingPage } from "@/components/marketing/nxttrack-marketing";

export const metadata: Metadata = {
  title: "NXTTRACK — Het next-gen platform voor moderne zwemscholen",
  description: "Ouderportaal, trainer app, backoffice, planning, diploma kluis, badges en communicatie. Eén modern platform voor de hele zwemschool.",
  openGraph: {
    title: "NXTTRACK — Next-gen platform voor zwemscholen",
    description: "Van intake tot diploma C. NXTTRACK brengt ouders, kinderen en instructeurs samen in één modern platform."
  }
};

export default function NxttrackMarketingPage() {
  return <LovableNxttrackMarketingPage />;
}

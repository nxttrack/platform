import { PageHero } from "@/components/lovable/page-kit";

export default function NewsPage() {
  return <PageHero kicker="Nieuws" title="Updates van de zwemschool" sub="Berichten, praktische informatie en aankondigingen voor ouders en leerlingen." primary={{ href: "/", label: "Home" }} />;
}

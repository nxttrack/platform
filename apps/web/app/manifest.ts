import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NXTTRACK",
    short_name: "NXTTRACK",
    description: "Planning, voortgang en familieportaal voor moderne zwemscholen.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#1d4ed8",
    lang: "nl-NL",
    categories: ["education", "sports", "productivity"],
    icons: [{ src: "/lovable/nxttrack-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
  };
}

export const positiveScoreLevels = [
  { score: 1, label: "Goed begonnen", description: "Eerste stap; veel begeleiding nodig." },
  { score: 2, label: "Goed bezig", description: "Aan het oefenen; regelmatig begeleiding nodig." },
  { score: 3, label: "Mooi op weg", description: "Groeiend; gedeeltelijk zelfstandig." },
  { score: 4, label: "Heel knap", description: "Bijna beheerst; meestal zelfstandig." },
  { score: 5, label: "Superster", description: "Beheerst; zelfstandig." }
] as const;

export const swimProgressTemplate = [
  {
    code: "water-confidence",
    name: "Watervrij en vertrouwen",
    description: "Comfort, veiligheid en plezier in en rond het water.",
    sortOrder: 10,
    items: [
      { code: "enter-exit", name: "Veilig in en uit het water", positiveGoal: "Stapt rustig in en uit het water." },
      { code: "face-in-water", name: "Gezicht in het water", positiveGoal: "Durft gezicht en oren in het water te brengen." },
      { code: "float-front-back", name: "Drijven op buik en rug", positiveGoal: "Blijft rustig drijven met passende hulp." }
    ]
  },
  {
    code: "movement-technique",
    name: "Bewegen en techniek",
    description: "Basisbewegingen die zwemslagen voorbereiden.",
    sortOrder: 20,
    items: [
      { code: "leg-kick", name: "Beenslag", positiveGoal: "Maakt een ritmische beenslag." },
      { code: "arm-action", name: "Armslag", positiveGoal: "Gebruikt armen steeds doelgerichter." },
      { code: "breathing", name: "Ademhaling", positiveGoal: "Ademt rustig tijdens de oefening." }
    ]
  },
  {
    code: "water-safety",
    name: "Waterveiligheid",
    description: "Omkeren, orienteren en naar de kant bewegen.",
    sortOrder: 30,
    items: [
      { code: "turn-around", name: "Omkeren in het water", positiveGoal: "Kan draaien en opnieuw richting kiezen." },
      { code: "reach-side", name: "Naar de kant", positiveGoal: "Beweegt veilig naar de kant." },
      { code: "underwater-orientation", name: "Onder water orienteren", positiveGoal: "Blijft rustig bij korte onderwateropdrachten." }
    ]
  },
  {
    code: "stamina-confidence",
    name: "Conditie en zelfstandigheid",
    description: "Vaardigheden langer vasthouden met vertrouwen.",
    sortOrder: 40,
    items: [
      { code: "steady-distance", name: "Rustig afstand zwemmen", positiveGoal: "Houdt tempo en techniek over langere afstand vast." },
      { code: "lesson-focus", name: "Lesfocus", positiveGoal: "Luistert, probeert opnieuw en blijft positief meedoen." },
      { code: "self-check", name: "Zelfvertrouwen", positiveGoal: "Herkent wat al goed gaat en wat de volgende stap is." }
    ]
  }
] as const;

export const badgeCatalogTemplate = [
  { code: "water-held", name: "Watervrij", description: "Voor vertrouwen in en rond het water.", iconName: "waves", sortOrder: 10 },
  { code: "float-champion", name: "Drijfkampioen", description: "Voor rustig drijven op buik of rug.", iconName: "star", sortOrder: 20 },
  { code: "kick-boost", name: "Beenslag boost", description: "Voor zichtbare groei in beenslag.", iconName: "sparkles", sortOrder: 30 },
  { code: "safe-side", name: "Veilig naar de kant", description: "Voor zelfstandig richting de kant bewegen.", iconName: "shield", sortOrder: 40 },
  { code: "positive-try", name: "Doorzetter", description: "Voor opnieuw proberen met een positieve houding.", iconName: "award", sortOrder: 50 }
] as const;

export function getPositiveScoreLabel(score: number | string) {
  const numericScore = typeof score === "string" ? Number(score) : score;

  return positiveScoreLevels.find((level) => level.score === numericScore)?.label ?? positiveScoreLevels[0].label;
}

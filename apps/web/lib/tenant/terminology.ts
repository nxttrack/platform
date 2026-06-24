export type SectorKey = "swim_school" | "football_school" | "sports_club" | "martial_arts_school" | "dance_school" | "generic_lessons";

export type CanonicalTerm =
  | "participant"
  | "guardian"
  | "instructor"
  | "program"
  | "stage"
  | "group"
  | "session"
  | "resource"
  | "certificate";

export const canonicalTerms: Record<CanonicalTerm, string> = {
  participant: "Participant",
  guardian: "Guardian",
  instructor: "Instructor",
  program: "Program",
  stage: "Stage",
  group: "Group",
  session: "Session",
  resource: "Resource",
  certificate: "Certificate"
};

export const sectorTerminology: Record<SectorKey, Partial<Record<CanonicalTerm, string>>> = {
  swim_school: {
    participant: "Leerling",
    guardian: "Ouder",
    instructor: "Instructeur",
    program: "Zwemprogramma",
    stage: "Badje",
    group: "Lesgroep",
    session: "Les",
    resource: "Bad / baan",
    certificate: "Diploma"
  },
  football_school: {
    participant: "Speler",
    guardian: "Ouder",
    instructor: "Trainer",
    program: "Trainingsprogramma",
    stage: "Niveau",
    group: "Teamgroep",
    session: "Training",
    resource: "Veld",
    certificate: "Certificaat"
  },
  sports_club: {},
  martial_arts_school: {
    participant: "Leerling",
    instructor: "Trainer",
    stage: "Band / niveau",
    session: "Training",
    resource: "Dojo"
  },
  dance_school: {
    participant: "Danser",
    instructor: "Docent",
    stage: "Niveau",
    session: "Les",
    resource: "Studio"
  },
  generic_lessons: {}
};

export function getTerm(sector: SectorKey, term: CanonicalTerm) {
  return sectorTerminology[sector][term] ?? canonicalTerms[term];
}

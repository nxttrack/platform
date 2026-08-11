import { Star } from "lucide-react";

import {
  getLearnerAssessmentAccessibleLabel,
  getLearnerAssessmentLevel,
  learnerAssessmentLevels,
  type LearnerAssessmentValue
} from "@/lib/domain/learner-assessment";
import type { AssessmentRatingDisplay } from "@/lib/theme/portal-theme-contract";
import { cn } from "@/lib/utils";

type Props = {
  value: LearnerAssessmentValue | null;
  display: AssessmentRatingDisplay;
  label?: string;
  name?: string;
  readOnly?: boolean;
  required?: boolean;
};

export function FivePointAssessment({
  value,
  display,
  label = "Beoordeling",
  name = "score",
  readOnly = false,
  required = false
}: Props) {
  if (readOnly) {
    return (
      <div
        aria-label={value ? `${label}: ${getLearnerAssessmentAccessibleLabel(value)}` : `${label}: Nog niet beoordeeld`}
        className="five-point-assessment"
        role="img"
      >
        {learnerAssessmentLevels.map((level) => (
          <AssessmentGlyph active={value !== null && (display === "stars" ? level.value <= value : level.value === value)} display={display} key={level.value} position={level.value} />
        ))}
        <span className="five-point-assessment__copy">{value ? `${value} van 5 · ${getLearnerAssessmentLevel(value).label}` : "Nog niet beoordeeld"}</span>
      </div>
    );
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-foreground">{label}</legend>
      <div className="five-point-assessment" role="radiogroup">
        {learnerAssessmentLevels.map((level) => (
          <label className="five-point-assessment__option" key={level.value}>
            <input
              className="peer sr-only"
              defaultChecked={value === level.value}
              name={name}
              required={required}
              type="radio"
              value={level.value}
            />
            <span aria-hidden="true" className="five-point-assessment__button">
              <AssessmentGlyph active={value === level.value} display={display} position={level.value} />
            </span>
            <span className="sr-only">{getLearnerAssessmentAccessibleLabel(level.value)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AssessmentGlyph({
  active,
  display,
  position
}: {
  active: boolean;
  display: AssessmentRatingDisplay;
  position: LearnerAssessmentValue;
}) {
  if (display === "stars") {
    return <Star aria-hidden="true" className={cn("five-point-assessment__star", active && "is-active")} fill={active ? "currentColor" : "none"} />;
  }

  return (
    <svg aria-hidden="true" className={cn("five-point-assessment__smiley", active && "is-active")} viewBox="0 0 40 40">
      <circle cx="20" cy="20" fill="currentColor" opacity={active ? 1 : 0.12} r="17" />
      <circle cx="14" cy="16" fill={active ? "white" : "currentColor"} r="1.8" />
      <circle cx="26" cy="16" fill={active ? "white" : "currentColor"} r="1.8" />
      <path
        d={["M13 27 Q20 22 27 27", "M13 25 Q20 24 27 25", "M13 24 Q20 27 27 24", "M12 23 Q20 29 28 23", "M11 22 Q20 31 29 22"][position - 1]}
        fill="none"
        stroke={active ? "white" : "currentColor"}
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

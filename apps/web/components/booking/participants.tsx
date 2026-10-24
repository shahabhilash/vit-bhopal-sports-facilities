"use client";
import { Minus, Plus } from "lucide-react";
import { isValidRegNo, normalizeRegNo } from "@vitb/shared";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function PlayerStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Fewer players"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden />
      </Button>
      <output id="player-count" aria-live="polite" className="min-w-16 text-center text-2xl font-bold tabular-nums">
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="More players"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden />
      </Button>
      <span className="text-sm text-muted-foreground">
        {min}–{max} allowed
      </span>
    </div>
  );
}

export interface RosterCheck {
  regNos: string[];
  invalid: string[];
  duplicates: string[];
  countError: string | null;
}

/** Parses a pasted list of registration numbers (commas, spaces or new lines). */
export function checkRoster(text: string, min: number, max: number): RosterCheck {
  const tokens = text
    .split(/[\s,;]+/)
    .map(normalizeRegNo)
    .filter(Boolean);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const regNos: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (!isValidRegNo(t)) {
      invalid.push(t);
      continue;
    }
    if (seen.has(t)) duplicates.add(t);
    else {
      seen.add(t);
      regNos.push(t);
    }
  }
  const countError =
    regNos.length < min
      ? `Add ${min - regNos.length} more player${min - regNos.length === 1 ? "" : "s"} (minimum ${min}).`
      : regNos.length > max
        ? `Remove ${regNos.length - max} player${regNos.length - max === 1 ? "" : "s"} (maximum ${max}).`
        : null;
  return { regNos, invalid, duplicates: [...duplicates], countError };
}

export function RosterInput({
  value,
  onChange,
  check,
  showErrors,
}: {
  value: string;
  onChange: (text: string) => void;
  check: RosterCheck;
  showErrors: boolean;
}) {
  const problems = [
    check.invalid.length > 0 && `Not a valid registration number: ${check.invalid.slice(0, 5).join(", ")}${check.invalid.length > 5 ? "…" : ""}`,
    check.duplicates.length > 0 && `Listed more than once: ${check.duplicates.join(", ")}`,
    showErrors && check.countError,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-2">
      <Label htmlFor="roster">Registration numbers, including yours</Label>
      <FieldHint id="roster-hint">
        Paste or type them separated by commas, spaces or new lines, e.g. 23BCE10001.
      </FieldHint>
      <Textarea
        id="roster"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        rows={5}
        aria-describedby={`roster-hint roster-count${problems.length ? " roster-errors" : ""}`}
        aria-invalid={problems.length > 0 || undefined}
        className="font-mono text-sm uppercase"
      />
      <p id="roster-count" aria-live="polite" className="text-sm font-semibold">
        {check.regNos.length} player{check.regNos.length === 1 ? "" : "s"} listed
      </p>
      {problems.length > 0 && (
        <div id="roster-errors" className="space-y-1">
          {problems.map((p) => (
            <FieldError key={p}>{p}</FieldError>
          ))}
        </div>
      )}
    </div>
  );
}

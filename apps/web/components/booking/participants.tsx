"use client";
import { Plus, X } from "lucide-react";
import { isValidRegNo, normalizeRegNo } from "@vitb/shared";
import { FieldError, FieldHint, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PlayersCheck {
  /** Valid, distinct registration numbers in box order. */
  regNos: string[];
  /** Per box: why it is wrong, or null. */
  boxErrors: (string | null)[];
  countError: string | null;
}

/** Checks one registration number per box. Empty boxes are allowed until there are too few players. */
export function checkPlayers(values: string[], min: number, max: number): PlayersCheck {
  const normalized = values.map(normalizeRegNo);
  const firstIndex = new Map<string, number>();
  const regNos: string[] = [];
  const boxErrors = normalized.map((n, i) => {
    if (!n) return null;
    if (!isValidRegNo(n)) return "Not a valid registration number, e.g. 23BCE10001.";
    const first = firstIndex.get(n);
    if (first !== undefined) return `Already listed as player ${first + 1}.`;
    firstIndex.set(n, i);
    regNos.push(n);
    return null;
  });
  const countError =
    regNos.length < min
      ? `Add ${min - regNos.length} more player${min - regNos.length === 1 ? "" : "s"} (minimum ${min}).`
      : regNos.length > max
        ? `Remove ${regNos.length - max} player${regNos.length - max === 1 ? "" : "s"} (maximum ${max}).`
        : null;
  return { regNos, boxErrors, countError };
}

/**
 * One box per player. The first box is the booker, filled from their account.
 * Pasting a list into any box spreads it over that box and the ones after it.
 */
export function PlayerInputs({
  values,
  onChange,
  min,
  max,
  ownRegNo,
  check,
  showErrors,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  min: number;
  max: number;
  ownRegNo: string | null;
  check: PlayersCheck;
  showErrors: boolean;
}) {
  function setBox(index: number, text: string) {
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    const next = [...values];
    if (tokens.length > 1) {
      tokens.forEach((t, k) => {
        if (index + k < max) next[index + k] = t;
      });
    } else {
      next[index] = text;
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <FieldHint id="players-hint">
        Enter one registration number per player, e.g. 23BCE10001. You are player 1. {min}–{max} players.
      </FieldHint>
      <ol className="space-y-2" aria-describedby="players-hint">
        {values.map((value, i) => {
          const locked = i === 0 && ownRegNo !== null;
          const error = check.boxErrors[i];
          const id = `player-${i + 1}`;
          return (
            <li key={i}>
              <div className="flex items-center gap-2">
                <label htmlFor={id} className="w-20 shrink-0 text-sm font-semibold">
                  {i === 0 ? "You" : `Player ${i + 1}`}
                </label>
                <Input
                  id={id}
                  value={locked ? ownRegNo : value}
                  readOnly={locked}
                  onChange={(e) => setBox(i, e.target.value)}
                  placeholder="23BCE10001"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={cn("min-w-0 font-mono uppercase", locked && "bg-muted text-muted-foreground")}
                />
                {i >= min ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`Remove player ${i + 1}`}
                    onClick={() => onChange(values.filter((_, k) => k !== i))}
                  >
                    <X aria-hidden />
                  </Button>
                ) : (
                  <span className="w-11 shrink-0" aria-hidden />
                )}
              </div>
              {error && (
                <FieldError id={`${id}-error`} className="ml-[5.5rem]">
                  {error}
                </FieldError>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={values.length >= max} onClick={() => onChange([...values, ""])}>
          <Plus aria-hidden />
          Add player
        </Button>
        <p id="players-count" aria-live="polite" className="text-sm font-semibold">
          {check.regNos.length} player{check.regNos.length === 1 ? "" : "s"} listed
        </p>
      </div>
      {showErrors && check.countError && <FieldError>{check.countError}</FieldError>}
    </div>
  );
}

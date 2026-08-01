import { callAction } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import type { BrandLintViolation } from "@shared/brand-lint";
import {
  IconColorSwatch,
  IconLoader2,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAgentGenerating } from "@/hooks/use-agent-generating";

interface LintResponse {
  linted: boolean;
  reason?: string;
  message?: string;
  designSystemTitle?: string;
  scannedSlides?: number;
  violationCount?: number;
  violations?: BrandLintViolation[];
}

interface BrandCheckButtonProps {
  deckId: string;
  deckTitle: string;
  canEdit: boolean;
  /** Jump the editor to the slide a violation points at. */
  onGoToSlide?: (slideId: string) => void;
}

/**
 * Toolbar popover for the deterministic brand lint (lint-deck-brand).
 * Lints on open rather than continuously — a check is one deck read, but
 * re-running it on every keystroke-debounced save would be pure chatter.
 * "Fix with AI" hands the confirmed findings to the agent chat
 * (delegate-to-agent) for targeted update-slide edits.
 */
export default function BrandCheckButton({
  deckId,
  deckTitle,
  canEdit,
  onGoToSlide,
}: BrandCheckButtonProps) {
  const t = useT();
  const { generating, submit: agentSubmit } = useAgentGenerating();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LintResponse | null>(null);
  const [error, setError] = useState(false);

  const runLint = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = (await callAction(
        "lint-deck-brand",
        { deckId },
        { method: "GET" },
      )) as LintResponse;
      setResult(response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void runLint();
  };

  const handleFixWithAi = () => {
    const violations = result?.violations ?? [];
    if (violations.length === 0) return;
    const message = t("brandCheck.fixMessage", {
      total: violations.length,
    });
    const context = [
      `Fix brand-lint violations in deck "${deckTitle}" (id: ${deckId}).`,
      `Design system: ${result?.designSystemTitle ?? "linked design system"}.`,
      "Confirmed findings from lint-deck-brand:",
      ...violations.map(
        (violation) =>
          `- slide ${violation.slideIndex + 1} (id ${violation.slideId}): ` +
          `${violation.rule} "${violation.value}" ×${violation.occurrences}` +
          (violation.suggestion
            ? ` → use ${violation.suggestion.token} = ${violation.suggestion.value}`
            : ""),
      ),
      "",
      "Follow the design-systems skill, Brand Linting section: make targeted " +
        "update-slide edits that replace each off-brand literal with the " +
        "suggested token value. Preserve layout, copy, and everything else. " +
        `Finish by running lint-deck-brand --deckId=${deckId} to confirm the ` +
        "deck is clean.",
    ].join("\n");
    setOpen(false);
    agentSubmit(message, context);
  };

  const violations = result?.linted ? (result.violations ?? []) : [];
  const knownCount = result?.linted ? (result.violationCount ?? 0) : 0;

  // Group for display; the engine already orders violations by slide.
  const bySlide = new Map<string, BrandLintViolation[]>();
  for (const violation of violations) {
    const key = `${violation.slideIndex}:${violation.slideId}`;
    bySlide.set(key, [...(bySlide.get(key) ?? []), violation]);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`relative flex-shrink-0 rounded-md p-2.5 transition-colors sm:p-1.5 ${
            open
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground/70"
          }`}
          aria-label={t("brandCheck.title")}
          title={t("brandCheck.title")}
        >
          <IconColorSwatch className="h-3.5 w-3.5" />
          {knownCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold leading-none text-black">
              {knownCount > 9 ? "9+" : knownCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("brandCheck.title")}</p>
            {result?.designSystemTitle && (
              <p className="truncate text-[11px] text-muted-foreground">
                {t("brandCheck.checkedAgainst", {
                  title: result.designSystemTitle,
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runLint()}
            disabled={loading}
            aria-label={t("brandCheck.recheck")}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconRefresh className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {error ? (
          <p className="text-xs text-destructive">{t("brandCheck.failed")}</p>
        ) : loading && !result ? (
          <div className="h-10 animate-pulse rounded-md bg-muted/50" />
        ) : result && !result.linted ? (
          <p className="text-xs text-muted-foreground">
            {result.message ?? t("brandCheck.failed")}
          </p>
        ) : violations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("brandCheck.clean")}
          </p>
        ) : (
          <>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {[...bySlide.entries()].map(([key, slideViolations]) => {
                const first = slideViolations[0];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => onGoToSlide?.(first.slideId)}
                      className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      title={t("brandCheck.goToSlide")}
                    >
                      {t("brandCheck.slide", { slide: first.slideIndex + 1 })}
                    </button>
                    <ul className="space-y-1">
                      {slideViolations.map((violation) => (
                        <li
                          key={`${violation.rule}:${violation.value}`}
                          className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                        >
                          {violation.rule === "off-palette-color" ? (
                            <span
                              className="h-3 w-3 flex-shrink-0 rounded-sm border border-border"
                              style={{ background: violation.value }}
                            />
                          ) : (
                            <span className="flex-shrink-0 italic text-muted-foreground">
                              Aa
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                            {violation.value}
                            {violation.occurrences > 1 &&
                              ` ×${violation.occurrences}`}
                          </span>
                          {violation.suggestion && (
                            <span
                              className="max-w-[40%] truncate text-[10px] text-muted-foreground"
                              title={violation.suggestion.token}
                            >
                              → {violation.suggestion.value}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <button
                type="button"
                onClick={handleFixWithAi}
                disabled={generating}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <IconSparkles className="h-3.5 w-3.5" />
                {t("brandCheck.fixWithAi")}
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

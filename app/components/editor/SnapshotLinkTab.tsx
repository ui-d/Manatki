import { appBasePath } from "@agent-native/core/client/api-path";
import { useT } from "@agent-native/core/client/i18n";
import type {
  ShareLinkListResponse,
  ShareLinkStatsResponse,
  ShareLinkSummary,
} from "@shared/api";
import {
  IconChartBar,
  IconCheck,
  IconCopy,
  IconLink,
  IconLinkOff,
  IconLoader2,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

import { CloudUpgrade } from "@/components/CloudUpgrade";
import { useDbStatus } from "@/hooks/use-db-status";

interface SnapshotLinkTabProps {
  deckId: string;
}

function shareUrlFor(token: string): string {
  return `${window.location.origin}${appBasePath()}/share/${token}`;
}

function viewStatsLine(
  link: ShareLinkSummary,
  t: ReturnType<typeof useT>,
): string {
  if (link.viewCount === 0) return t("share.noViewsYet");
  const summary = t("share.viewSummary", {
    views: link.viewCount,
    viewers: link.uniqueSessions,
  });
  if (!link.lastViewedAt) return summary;
  return `${summary} · ${t("share.lastViewed", {
    date: new Date(link.lastViewedAt).toLocaleDateString(),
  })}`;
}

/**
 * "Snapshot link" tab inside the framework Share dialog: mint, list, copy,
 * and revoke public read-only snapshot links (frozen copies of the deck,
 * 30-day TTL). Replaces the orphaned pre-framework ShareDialog popover.
 */
export default function SnapshotLinkTab({ deckId }: SnapshotLinkTabProps) {
  const t = useT();
  const { isLocal } = useDbStatus();
  const [links, setLinks] = useState<ShareLinkSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statsToken, setStatsToken] = useState<string | null>(null);
  const [stats, setStats] = useState<ShareLinkStatsResponse | null>(null);
  const [statsError, setStatsError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${appBasePath()}/api/share?deckId=${encodeURIComponent(deckId)}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || t("share.loadLinksFailed"));
      }
      const data: ShareLinkListResponse = await res.json();
      setLinks(data.links);
      setError("");
    } catch (err) {
      setLinks([]);
      setError(err instanceof Error ? err.message : t("share.loadLinksFailed"));
    }
  }, [deckId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${appBasePath()}/api/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck: { id: deckId } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || t("share.createFailed"));
      }
      const data: { shareToken: string } = await res.json();
      await navigator.clipboard
        .writeText(shareUrlFor(data.shareToken))
        .catch(() => {});
      setCopiedToken(data.shareToken);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(shareUrlFor(token)).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 2000);
  };

  const handleToggleStats = async (token: string) => {
    if (statsToken === token) {
      setStatsToken(null);
      setStats(null);
      return;
    }
    setStatsToken(token);
    setStats(null);
    setStatsError("");
    try {
      const res = await fetch(
        `${appBasePath()}/api/share/${encodeURIComponent(token)}/stats`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || t("share.statsFailed"));
      }
      setStats((await res.json()) as ShareLinkStatsResponse);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : t("share.statsFailed"),
      );
    }
  };

  const handleRevoke = async (token: string) => {
    setRevoking(token);
    setError("");
    try {
      const res = await fetch(
        `${appBasePath()}/api/share/${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || t("share.revokeFailed"));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.revokeFailed"));
    } finally {
      setRevoking(null);
    }
  };

  if (isLocal) {
    return (
      <CloudUpgrade
        title={t("share.title")}
        description={t("share.cloudUpgradeDescription")}
        onClose={() => {}}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("share.snapshotDescription")}
      </p>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {creating ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconLink className="h-4 w-4" />
        )}
        {creating ? t("share.creatingLink") : t("share.createShareLink")}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("share.activeLinks")}
        </p>
        {links === null ? (
          <div className="h-8 animate-pulse rounded-md bg-muted/50" />
        ) : links.length === 0 ? (
          <p className="text-xs text-muted-foreground/80">
            {t("share.noLinks")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li
                key={link.token}
                className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] text-foreground/80">
                      {shareUrlFor(link.token)}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {viewStatsLine(link, t)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleStats(link.token)}
                    aria-label={t("share.slideStats")}
                    aria-expanded={statsToken === link.token}
                    className={`rounded p-1 hover:bg-accent hover:text-foreground ${
                      statsToken === link.token
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <IconChartBar className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(link.token)}
                    aria-label={t("share.copyLink")}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {copiedToken === link.token ? (
                      <IconCheck className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <IconCopy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(link.token)}
                    disabled={revoking === link.token}
                    aria-label={t("share.revoke")}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                  >
                    {revoking === link.token ? (
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconLinkOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {statsToken === link.token && (
                  <div className="mt-1.5 border-t border-border/60 pt-1.5">
                    {statsError ? (
                      <p className="text-[10px] text-destructive">
                        {statsError}
                      </p>
                    ) : stats === null ? (
                      <div className="h-4 animate-pulse rounded bg-muted/50" />
                    ) : stats.slides.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/80">
                        {t("share.noSlideStats")}
                      </p>
                    ) : (
                      <ul className="space-y-0.5">
                        {stats.slides.map((slide) => (
                          <li
                            key={slide.slideIndex}
                            className="text-[10px] text-muted-foreground"
                          >
                            {t("share.slideStatRow", {
                              slide: slide.slideIndex + 1,
                              viewers: slide.viewers,
                              seconds: Math.round(slide.avgDwellMs / 1000),
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        {t("share.anyoneWithLink")} {t("share.expiresNote")}
      </p>
    </div>
  );
}

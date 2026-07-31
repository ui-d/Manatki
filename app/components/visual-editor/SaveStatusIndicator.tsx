import { useT } from "@agent-native/core/client/i18n";
import { IconAlertTriangle, IconCloudOff } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface SaveStatusIndicatorProps {
  /**
   * True while a save is in flight or pending (debounced). Deliberately NOT
   * rendered: automatic saving is silent (Figma-style) — a "Saving…/Saved"
   * ticker is clutter. Only the exceptional states get UI.
   */
  saving: boolean;
  /** True when offline. Shows the warning state. */
  offline?: boolean;
  /** True when the last save failed and is being retried with backoff. */
  error?: boolean;
  className?: string;
}

export function SaveStatusIndicator({
  saving: _saving,
  offline,
  error,
  className,
}: SaveStatusIndicatorProps) {
  const t = useT();

  // Only the actionable, exceptional states render — silent otherwise.
  // Offline wins over error: while offline every save fails, and "Offline"
  // names the cause the user can actually act on.
  if (offline) {
    return (
      <div
        data-save-status="offline"
        title={t("raw.saveReconnect")}
        className={cn(
          "flex items-center gap-1 text-[11px] text-amber-500 whitespace-nowrap",
          className,
        )}
      >
        <IconCloudOff className="w-3 h-3" />
        <span className="hidden xl:inline">{t("raw.offline")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-save-status="error"
        title={t("raw.saveFailedRetrying")}
        className={cn(
          "flex items-center gap-1 text-[11px] text-red-500 whitespace-nowrap",
          className,
        )}
      >
        <IconAlertTriangle className="w-3 h-3" />
        <span className="hidden xl:inline">{t("raw.saveFailed")}</span>
      </div>
    );
  }

  return null;
}

import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconMail, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface NewsletterStatusResult {
  status: "none" | "pending" | "subscribed" | "unsubscribed";
  promptDismissed: boolean;
  confirmedAt: string | null;
}

/**
 * One-time newsletter opt-in prompt on the decks page. GDPR posture: shown
 * once, nothing pre-selected, subscribing is an explicit affirmative act, and
 * any decision (subscribe, decline, dismiss) hides it permanently. The
 * permanent home for the preference is Settings → General.
 */
export function NewsletterPrompt() {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const { data } = useActionQuery<NewsletterStatusResult>(
    "get-newsletter-status",
  );
  const subscribeMutation = useActionMutation("subscribe-newsletter");
  const dismissMutation = useActionMutation("dismiss-newsletter-prompt");

  if (hidden && !subscribed) return null;
  if (!data) return null;
  if (!subscribed && (data.status !== "none" || data.promptDismissed)) {
    return null;
  }

  const dismiss = () => {
    setHidden(true);
    // Fire-and-forget: hiding locally must not wait on the network.
    dismissMutation.mutate({});
  };

  const subscribe = () => {
    setSubscribed(true);
    subscribeMutation.mutate(
      { source: "decks-prompt" },
      // The prompt disappears for good either way; errors surface in Settings.
      { onSettled: () => dismissMutation.mutate({}) },
    );
  };

  return (
    <Card className="relative mb-6">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <IconMail className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
        {subscribed ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t("newsletter.pendingTitle")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("newsletter.pendingNote")}
            </p>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t("newsletter.promptTitle")}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("newsletter.promptBody")}{" "}
                <a href="/privacy" className="underline underline-offset-2">
                  {t("newsletter.privacyPolicy")}
                </a>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" onClick={subscribe}>
                {t("newsletter.promptSubscribe")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
                {t("newsletter.promptDecline")}
              </Button>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("newsletter.promptDismiss")}
          className="absolute right-2 top-2 text-muted-foreground transition-colors hover:text-foreground sm:static"
        >
          <IconX className="size-4" />
        </button>
      </CardContent>
    </Card>
  );
}

import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface NewsletterStatusResult {
  status: "none" | "pending" | "subscribed" | "unsubscribed";
  promptDismissed: boolean;
  confirmedAt: string | null;
}

interface SubscribeResult {
  status: string;
  emailConfigured: boolean;
}

/** Newsletter consent card for Settings → General. */
export function NewsletterSettingsCard() {
  const t = useT();
  const [error, setError] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const { data, refetch } = useActionQuery<NewsletterStatusResult>(
    "get-newsletter-status",
  );
  const mutationOptions = {
    onError: () => setError(true),
    onSettled: () => void refetch(),
  };
  const subscribeMutation = useActionMutation<SubscribeResult>(
    "subscribe-newsletter",
    {
      ...mutationOptions,
      onSuccess: (result: SubscribeResult) => {
        setError(false);
        setEmailConfigured(result.emailConfigured);
      },
    },
  );
  const unsubscribeMutation = useActionMutation("unsubscribe-newsletter", {
    ...mutationOptions,
    onSuccess: () => setError(false),
  });

  const status = data?.status ?? "none";
  const busy = subscribeMutation.isPending || unsubscribeMutation.isPending;

  const onToggle = (checked: boolean) => {
    if (checked) {
      subscribeMutation.mutate({ source: "settings" });
    } else {
      unsubscribeMutation.mutate({});
    }
  };

  return (
    <Card id="newsletter" className="scroll-mt-16">
      <CardHeader>
        <CardTitle className="text-base">{t("newsletter.title")}</CardTitle>
        <CardDescription>{t("newsletter.settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id="newsletter-toggle"
            checked={status === "subscribed" || status === "pending"}
            disabled={!data || busy}
            onCheckedChange={onToggle}
          />
          <Label htmlFor="newsletter-toggle">
            {t("newsletter.toggleLabel")}
          </Label>
        </div>
        {status === "pending" && (
          <div className="space-y-2">
            <p className="text-sm text-amber-600 dark:text-amber-500">
              {t("newsletter.pendingNote")}
            </p>
            {!emailConfigured && (
              <p className="text-sm text-muted-foreground">
                {t("newsletter.devHint")}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => subscribeMutation.mutate({ source: "settings" })}
            >
              {t("newsletter.resend")}
            </Button>
          </div>
        )}
        {status === "subscribed" && data?.confirmedAt && (
          <p className="text-sm text-muted-foreground">
            {t("newsletter.subscribedSince", {
              date: new Date(data.confirmedAt).toLocaleDateString(),
            })}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            {t("newsletter.updateFailed")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

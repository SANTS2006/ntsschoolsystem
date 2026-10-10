import { BadgeCheck, ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";

import { useVerifyIdCard } from "./useIdCardsCrud";

/** What a QR scan lands on. Public by design: shows only enough (name, photo, role, school,
 * validity) to compare the person in front of you with the card — never contact or birth details. */
export function PublicVerifyCardPage() {
  const { token } = useParams<{ token: string }>();
  const { data: card, isLoading, isError } = useVerifyIdCard(token);

  if (isLoading) return <FullPageSpinner />;

  if (isError || !card) {
    return (
      <Alert tone="danger">
        This card could not be found. It may be fake or mistyped — do not treat it as valid identification.
      </Alert>
    );
  }

  const Icon = card.valid ? BadgeCheck : ShieldAlert;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
        <div
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${
            card.valid
              ? "bg-[var(--color-success-soft,#dcfce7)] text-[var(--color-success,#15803d)]"
              : "bg-[var(--color-danger-soft,#fee2e2)] text-[var(--color-danger,#b91c1c)]"
          }`}
          role="status"
        >
          <Icon className="size-5" aria-hidden="true" />
          {card.valid ? "Valid ID card" : `Not valid${card.reason ? ` — ${card.reason}` : ""}`}
        </div>

        {card.photo ? (
          <img src={card.photo} alt={`Photo of ${card.name}`} className="h-36 w-28 rounded-lg border border-[var(--color-border)] object-cover" />
        ) : (
          <div className="flex h-36 w-28 items-center justify-center rounded-lg bg-[var(--color-bg-subtle)] text-3xl font-bold text-[var(--color-text-muted)]">
            {card.name.charAt(0)}
          </div>
        )}

        <div>
          <p className="text-lg font-semibold text-[var(--color-text)]">{card.name}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {card.role}
            {card.number ? ` · ${card.number}` : ""}
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{card.school_name}</p>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          Card {card.card_number}
          {card.expires_at ? ` · valid until ${new Date(card.expires_at).toLocaleDateString()}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

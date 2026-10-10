import { IdCard as IdCardIcon } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";

import { IdCardSheet } from "./IdCardSheet";
import { useMyIdCard } from "./useIdCardsCrud";

export function MyIdCardPage() {
  const { data: card, isLoading, isError, error } = useMyIdCard();

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <Alert tone="danger">{error.message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My ID card</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Print it or save it as an image.</p>
      </div>

      {card ? (
        <IdCardSheet cards={[card]} />
      ) : (
        <EmptyState
          icon={IdCardIcon}
          title="No ID card yet"
          description="The school office hasn't issued your ID card. Please check back later."
        />
      )}
    </div>
  );
}

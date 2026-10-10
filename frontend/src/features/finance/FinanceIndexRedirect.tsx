import { Navigate } from "react-router-dom";

import { useHasPermission } from "@/features/auth/useAuth";

/** `/finance` alone has no page of its own — send the visitor to the first tab they can
 * actually see. A role with only `payments.view` (no `fees.*` at all) should land on Payments,
 * not a hidden Invoices tab. */
export function FinanceIndexRedirect() {
  const canViewFees = useHasPermission("fees.view");
  const canViewPayments = useHasPermission("payments.view");

  if (canViewFees) return <Navigate to="invoices" replace />;
  if (canViewPayments) return <Navigate to="payments" replace />;
  return <Navigate to="invoices" replace />;
}

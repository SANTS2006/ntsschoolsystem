import { Navigate } from "react-router-dom";

/** `/salary` alone has no page of its own — send the visitor to the payments tab, the most
 * common entry point (mirrors FinanceIndexRedirect). */
export function SalaryIndexRedirect() {
  return <Navigate to="payments" replace />;
}

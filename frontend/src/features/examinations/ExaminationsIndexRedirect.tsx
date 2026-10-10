import { Navigate } from "react-router-dom";

/** `/examinations` alone has no page of its own — send the visitor to the first tab. */
export function ExaminationsIndexRedirect() {
  return <Navigate to="exams" replace />;
}

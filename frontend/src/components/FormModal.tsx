import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Modal } from "@/components/ui/Modal";
import { parentPathOf } from "@/lib/formModalPaths";

function detailTitleFor(pathname: string): string {
  const parts = pathname.replace(/\/+$/, "").split("/");
  const noun = (parts[parts.length - 2] ?? "").replace(/-/g, " ");
  const singular = noun.endsWith("ies") ? `${noun.slice(0, -3)}y` : noun.endsWith("s") ? noun.slice(0, -1) : noun;
  return `${singular.charAt(0).toUpperCase()}${singular.slice(1)} details`;
}

function titleFor(pathname: string): string {
  const parts = pathname.replace(/\/+$/, "").split("/");
  const isEdit = parts[parts.length - 1] === "edit";
  const noun = (parts[parts.length - (isEdit ? 3 : 2)] ?? "").replace(/-/g, " ");
  const singular = noun.endsWith("ies") ? `${noun.slice(0, -3)}y` : noun.endsWith("sses") ? noun.slice(0, -2) : noun.endsWith("s") ? noun.slice(0, -1) : noun;
  return `${isEdit ? "Edit" : "Add"} ${singular}`.trim();
}

/** An add/edit form shown as a dialog over the list it belongs to. The list stays on the page behind it (so closing
 * the dialog, or saving, lands you right back on it), and the form itself is the same page component as ever — the
 * `.modal-form` styles drop its page heading and card chrome so it reads as a dialog, not a page inside a dialog. */
export function FormModal({
  list,
  large = false,
  detail = false,
  children,
}: {
  list: ReactNode;
  large?: boolean;
  /** A read-only details page (small enough not to need a page of its own) rather than an add/edit form. */
  detail?: boolean;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none select-none">
        {list}
      </div>
      <Modal open onClose={() => navigate(parentPathOf(pathname))} title={detail ? detailTitleFor(pathname) : titleFor(pathname)} maxWidthClassName={large ? "max-w-3xl" : "max-w-xl"}>
        <div className={detail ? "modal-detail" : "modal-form"}>{children}</div>
      </Modal>
    </>
  );
}

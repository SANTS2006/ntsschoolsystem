import { BookOpen, Search } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";

import { reservationStatusTone, statusLabel } from "./statusTone";
import { useBorrowBook, useCancelMyReservation, useCatalog, useMyLibrary, useReserveBook } from "./useLibraryCrud";

/** The library for a student or a teacher: browse every book, reserve one (the librarian approves or rejects it) or
 * borrow an available copy yourself, and see your own reservations and loans. */
export function MyLibraryPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data: books, isLoading, isError, error } = useCatalog(debounced);
  const { data: mine } = useMyLibrary();
  const reserve = useReserveBook();
  const borrow = useBorrowBook();
  const cancel = useCancelMyReservation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = (id: string, action: "reserve" | "borrow") => {
    setBusyId(id);
    (action === "reserve" ? reserve : borrow).mutate(id, {
      onSuccess: () => showToast({ title: action === "reserve" ? "Reservation sent to the librarian" : "Book borrowed" }),
      onError: (err: ApiError) => showToast({ title: "Could not complete that", description: err.message, tone: "danger" }),
      onSettled: () => setBusyId(null),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Library</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Find a book, reserve it or borrow it, and keep track of what you have.</p>
      </div>

      <div className="w-full max-w-sm">
        <Input icon={Search} placeholder="Search by title, author or ISBN" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <Alert tone="danger">{(error as ApiError).message}</Alert>
      ) : !books || books.length === 0 ? (
        <EmptyState icon={BookOpen} title="No books found" description="Try a different search." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => (
            <Card key={book.id}>
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text)]">{book.title}</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {[book.author, book.category_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {book.description && <p className="line-clamp-3 text-sm text-[var(--color-text)]">{book.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <Badge tone={book.available_copies > 0 ? "success" : "warning"}>
                    {book.available_copies > 0 ? `${book.available_copies} of ${book.total_copies} available` : "None available"}
                  </Badge>
                  {book.my_loan_due && <Badge tone="primary">You have it · due {new Date(book.my_loan_due).toLocaleDateString()}</Badge>}
                  {book.my_reservation && <Badge tone="neutral">Reservation {book.my_reservation}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!book.my_reservation || !!book.my_loan_due}
                    isLoading={busyId === book.id && reserve.isPending}
                    onClick={() => run(book.id, "reserve")}
                  >
                    Reserve
                  </Button>
                  <Button
                    size="sm"
                    disabled={book.available_copies === 0 || !!book.my_loan_due}
                    isLoading={busyId === book.id && borrow.isPending}
                    onClick={() => run(book.id, "borrow")}
                  >
                    Borrow
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My reservations</CardTitle>
        </CardHeader>
        <CardContent>
          {!mine || mine.reservations.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">You haven&apos;t reserved any books.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Book</TableHeaderCell>
                    <TableHeaderCell>Asked</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Librarian&apos;s note</TableHeaderCell>
                    <TableHeaderCell />
                  </tr>
                </TableHead>
                <TableBody>
                  {mine.reservations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.book_title}</TableCell>
                      <TableCell>{new Date(r.reserved_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge tone={reservationStatusTone(r.status)}>{statusLabel(r.status)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">{r.decision_note || "—"}</TableCell>
                      <TableCell className="text-right">
                        {(r.status === "pending" || r.status === "approved") && (
                          <Button size="sm" variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My loans</CardTitle>
        </CardHeader>
        <CardContent>
          {!mine || mine.loans.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">You haven&apos;t borrowed any books.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Book</TableHeaderCell>
                    <TableHeaderCell>Borrowed</TableHeaderCell>
                    <TableHeaderCell>Due</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {mine.loans.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.book_title}
                        <span className="block text-xs text-[var(--color-text-muted)]">Copy {l.copy_number}</span>
                      </TableCell>
                      <TableCell>{new Date(l.borrowed_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(l.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {l.status === "returned" ? (
                          <Badge tone="success">Returned</Badge>
                        ) : l.is_overdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : (
                          <Badge tone="primary">Borrowed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

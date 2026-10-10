import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useBookCopyList, useBookList, useCheckoutBook } from "./useLibraryCrud";

type BorrowerType = "student" | "staff";

export function CheckoutPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bookId, setBookId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [borrowerType, setBorrowerType] = useState<BorrowerType>("student");
  const [borrowerId, setBorrowerId] = useState("");

  const { data: books } = useBookList({ page_size: 100 });
  const { data: copies, isLoading: isLoadingCopies } = useBookCopyList(
    { book: bookId, status: "available", page_size: 100 },
    { enabled: !!bookId },
  );
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: staff } = useStaffLookup();
  const checkoutBook = useCheckoutBook();

  const handleSubmit = () => {
    checkoutBook.mutate(
      {
        copy: copyId,
        student: borrowerType === "student" ? borrowerId : undefined,
        staff: borrowerType === "staff" ? borrowerId : undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: "Book checked out" });
          navigate("/library/loans");
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not check out book", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Check out a book</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {checkoutBook.isError && (
            <Alert tone="danger">{generalErrorMessage(checkoutBook.error as ApiError)}</Alert>
          )}

          <Select
            label="Book"
            value={bookId}
            onChange={(e) => {
              setBookId(e.target.value);
              setCopyId("");
            }}
          >
            <option value="">Select a book</option>
            {books?.results.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title} ({book.available_copies} available)
              </option>
            ))}
          </Select>

          <Select
            label="Copy"
            value={copyId}
            onChange={(e) => setCopyId(e.target.value)}
            disabled={!bookId || isLoadingCopies}
          >
            <option value="">{bookId && !isLoadingCopies && copies?.results.length === 0 ? "No copies available" : "Select a copy"}</option>
            {copies?.results.map((copy) => (
              <option key={copy.id} value={copy.id}>
                {copy.copy_number}
              </option>
            ))}
          </Select>

          <Select
            label="Borrower type"
            value={borrowerType}
            onChange={(e) => {
              setBorrowerType(e.target.value as BorrowerType);
              setBorrowerId("");
            }}
          >
            <option value="student">Student</option>
            <option value="staff">Staff</option>
          </Select>

          {borrowerType === "student" ? (
            <Select label="Student" value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)}>
              <option value="">Select a student</option>
              {students?.results.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} ({student.admission_number})
                </option>
              ))}
            </Select>
          ) : (
            <Select label="Staff member" value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)}>
              <option value="">Select a staff member</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} isLoading={checkoutBook.isPending} disabled={!copyId || !borrowerId}>
              <BookOpen className="size-4" aria-hidden="true" />
              Check out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

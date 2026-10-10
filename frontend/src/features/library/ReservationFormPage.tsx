import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useBookList, useCreateReservation } from "./useLibraryCrud";

const schema = z.object({
  book: z.string().min(1, "Book is required"),
  borrower_type: z.enum(["student", "staff"]),
  borrower: z.string().min(1, "Borrower is required"),
});

type FormValues = z.infer<typeof schema>;
const FIELD_KEYS = new Set(["book", "student", "staff"]);

export function ReservationFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: books } = useBookList({ page_size: 100 });
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: staff } = useStaffLookup();
  const createReservation = useCreateReservation();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { book: "", borrower_type: "student", borrower: "" },
  });

  const borrowerType = useWatch({ control, name: "borrower_type" });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    createReservation.mutate(
      {
        book: values.book,
        student: values.borrower_type === "student" ? values.borrower : undefined,
        staff: values.borrower_type === "staff" ? values.borrower : undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: "Reservation created" });
          navigate("/library/reservations");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not create reservation", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">New reservation</h1>

      <Card>
        <CardHeader>
          <CardTitle>Reservation details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Book" error={errors.book?.message} {...register("book")}>
              <option value="">Select a book</option>
              {books?.results.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </Select>
            <Select label="Borrower type" {...register("borrower_type")}>
              <option value="student">Student</option>
              <option value="staff">Staff</option>
            </Select>
            {borrowerType === "student" ? (
              <Select label="Student" error={errors.borrower?.message} {...register("borrower")}>
                <option value="">Select a student</option>
                {students?.results.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name} ({student.admission_number})
                  </option>
                ))}
              </Select>
            ) : (
              <Select label="Staff member" error={errors.borrower?.message} {...register("borrower")}>
                <option value="">Select a staff member</option>
                {staff?.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </Select>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/library/reservations")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createReservation.isPending}>
                {!createReservation.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

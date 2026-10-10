import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStaffList } from "@/features/staff/useStaffCrud";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import {
  useCreateStaffSalaryAssignment,
  useSalaryStructureList,
  useStaffSalaryAssignment,
  useUpdateStaffSalaryAssignment,
} from "./useSalaryCrud";

const schema = z.object({
  staff: z.string().min(1, "Staff member is required"),
  salary_structure: z.string().min(1, "Salary structure is required"),
  effective_from: z.string().min(1, "Effective date is required"),
});

type FormValues = z.infer<typeof schema>;

const todayISO = () => new Date().toISOString().slice(0, 10);

export function StaffSalaryAssignmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: assignment, isLoading: isLoadingAssignment } = useStaffSalaryAssignment(id);
  const { data: staffMembers } = useStaffList({ page_size: 200, employment_status: "active" });
  const { data: structures } = useSalaryStructureList({ page_size: 100 });
  const createAssignment = useCreateStaffSalaryAssignment();
  const updateAssignment = useUpdateStaffSalaryAssignment(id ?? "");
  const mutation = isEditMode ? updateAssignment : createAssignment;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { staff: "", salary_structure: "", effective_from: todayISO() },
  });

  useEffect(() => {
    if (assignment) {
      reset({
        staff: assignment.staff,
        salary_structure: assignment.salary_structure,
        effective_from: assignment.effective_from,
      });
    }
  }, [assignment, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Assignment updated" : "Salary structure assigned" });
        navigate("/salary/assignments");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, new Set(["staff", "salary_structure", "effective_from"]))) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save assignment", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingAssignment) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit salary assignment" : "Assign a salary structure"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Assignment details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Staff member" error={errors.staff?.message} {...register("staff")} disabled={isEditMode}>
              <option value="">Select a staff member</option>
              {staffMembers?.results.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.full_name}
                </option>
              ))}
            </Select>
            <Select label="Salary structure" error={errors.salary_structure?.message} {...register("salary_structure")}>
              <option value="">Select a salary structure</option>
              {structures?.results.map((structure) => (
                <option key={structure.id} value={structure.id}>
                  {structure.name}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              label="Effective from"
              error={errors.effective_from?.message}
              {...register("effective_from")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/salary/assignments")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

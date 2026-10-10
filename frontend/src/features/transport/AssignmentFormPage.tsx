import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useCreateAssignment, useRouteList, useStopList } from "./useTransportCrud";

export function AssignmentFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [studentId, setStudentId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");

  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: routes } = useRouteList({ page_size: 100 });
  const { data: stops, isLoading: isLoadingStops } = useStopList(
    { route: routeId, page_size: 100 },
    { enabled: !!routeId },
  );
  const createAssignment = useCreateAssignment();

  const handleSubmit = () => {
    createAssignment.mutate(
      { student: studentId, route: routeId, stop: stopId },
      {
        onSuccess: () => {
          showToast({ title: "Student assigned" });
          navigate("/transport/assignments");
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not assign student", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign student to route</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {createAssignment.isError && (
            <Alert tone="danger">{generalErrorMessage(createAssignment.error as ApiError)}</Alert>
          )}

          <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a student</option>
            {students?.results.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} ({student.admission_number})
              </option>
            ))}
          </Select>

          <Select
            label="Route"
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setStopId("");
            }}
          >
            <option value="">Select a route</option>
            {routes?.results.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </Select>

          <Select
            label="Stop"
            value={stopId}
            onChange={(e) => setStopId(e.target.value)}
            disabled={!routeId || isLoadingStops}
          >
            <option value="">
              {routeId && !isLoadingStops && stops?.results.length === 0 ? "No stops on this route" : "Select a stop"}
            </option>
            {stops?.results.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </Select>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              isLoading={createAssignment.isPending}
              disabled={!studentId || !routeId || !stopId}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

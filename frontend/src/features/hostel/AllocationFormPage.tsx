import { useQuery } from "@tanstack/react-query";
import { BedDouble } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useAllocateBed, useBedList, useHostelList, useRoomList } from "./useHostelCrud";

export function AllocationFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [studentId, setStudentId] = useState("");
  const [hostelId, setHostelId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");

  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: hostels } = useHostelList({ page_size: 100 });
  const { data: rooms, isLoading: isLoadingRooms } = useRoomList(
    { hostel: hostelId, page_size: 100 },
    { enabled: !!hostelId },
  );
  const { data: beds, isLoading: isLoadingBeds } = useBedList(
    { room: roomId, page_size: 100 },
    { enabled: !!roomId },
  );
  const availableBeds = useMemo(() => beds?.results.filter((bed) => !bed.is_occupied) ?? [], [beds]);
  const allocateBed = useAllocateBed();

  const handleSubmit = () => {
    allocateBed.mutate(
      { student: studentId, bed: bedId },
      {
        onSuccess: () => {
          showToast({ title: "Bed allocated" });
          navigate("/hostel/allocations");
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not allocate bed", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Allocate a bed</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {allocateBed.isError && (
            <Alert tone="danger">{generalErrorMessage(allocateBed.error as ApiError)}</Alert>
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
            label="Hostel"
            value={hostelId}
            onChange={(e) => {
              setHostelId(e.target.value);
              setRoomId("");
              setBedId("");
            }}
          >
            <option value="">Select a hostel</option>
            {hostels?.results.map((hostel) => (
              <option key={hostel.id} value={hostel.id}>
                {hostel.name}
              </option>
            ))}
          </Select>

          <Select
            label="Room"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setBedId("");
            }}
            disabled={!hostelId || isLoadingRooms}
          >
            <option value="">{hostelId && !isLoadingRooms && rooms?.results.length === 0 ? "No rooms in this hostel" : "Select a room"}</option>
            {rooms?.results.map((room) => (
              <option key={room.id} value={room.id}>
                {room.room_number}
              </option>
            ))}
          </Select>

          <Select label="Bed" value={bedId} onChange={(e) => setBedId(e.target.value)} disabled={!roomId || isLoadingBeds}>
            <option value="">
              {roomId && !isLoadingBeds && availableBeds.length === 0 ? "No available beds in this room" : "Select a bed"}
            </option>
            {availableBeds.map((bed) => (
              <option key={bed.id} value={bed.id}>
                {bed.bed_number}
              </option>
            ))}
          </Select>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              isLoading={allocateBed.isPending}
              disabled={!studentId || !bedId}
            >
              <BedDouble className="size-4" aria-hidden="true" />
              Allocate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

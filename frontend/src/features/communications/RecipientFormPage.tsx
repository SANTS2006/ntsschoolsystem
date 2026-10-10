import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { listUsers } from "@/features/users/api";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useAnnouncement, useCreateRecipient } from "./useCommunicationsCrud";

export function RecipientFormPage() {
  const { announcementId } = useParams<{ announcementId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [userId, setUserId] = useState("");

  const { data: announcement } = useAnnouncement(announcementId);
  const { data: users } = useQuery({ queryKey: ["users", "lookup"], queryFn: listUsers });
  const createRecipient = useCreateRecipient();

  const handleSubmit = () => {
    createRecipient.mutate(
      { announcement: announcementId as string, user: userId },
      {
        onSuccess: () => {
          showToast({ title: "Recipient added" });
          navigate(`/communications/${announcementId}/recipients`);
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not add recipient", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{announcement ? `Add recipient to ${announcement.title}` : "Add recipient"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {createRecipient.isError && (
            <Alert tone="danger">{generalErrorMessage(createRecipient.error as ApiError)}</Alert>
          )}

          <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select a user</option>
            {users?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({user.email})
              </option>
            ))}
          </Select>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} isLoading={createRecipient.isPending} disabled={!userId}>
              <UserPlus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

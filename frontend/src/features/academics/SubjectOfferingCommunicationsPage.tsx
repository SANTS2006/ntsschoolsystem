import { Send } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { useSubjectsHomePath } from "./useSubjectsHomePath";
import { useCreateSubjectMessage, useSubjectMessages, useSubjectOffering } from "./useAcademicsCrud";

/** General class messages for one subject offering. Materials moved to the Lessons page (see
 * TeacherSubjectLessonsPage.tsx) — the two were the same idea from a teacher's point of view. */
export function SubjectOfferingCommunicationsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const subjectsHome = useSubjectsHomePath();
  const { showToast } = useToast();

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  const { data: messages, isLoading: isLoadingMessages } = useSubjectMessages(id);
  const createMessage = useCreateSubjectMessage();

  const [messageBody, setMessageBody] = useState("");

  const handleSendMessage = () => {
    if (!id || !messageBody.trim()) return;
    createMessage.mutate(
      { subject_offering: id, body: messageBody.trim() },
      {
        onSuccess: () => {
          showToast({ title: "Message sent to the class" });
          setMessageBody("");
        },
        onError: (err: ApiError) => showToast({ title: "Could not send", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoadingOffering) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject offering not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(subjectsHome)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        {subjectsHome === "/subjects" ? "Back to subjects" : "Back to subject offerings"}
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {offering.subject_name} — {offering.school_class_name} · Messages
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{offering.term_name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message the class</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={3}
            placeholder="Write a message for this subject..."
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
          />
          <div className="flex justify-end">
            <Button onClick={handleSendMessage} disabled={!messageBody.trim()} isLoading={createMessage.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Send to class
            </Button>
          </div>

          {isLoadingMessages ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : messages && messages.results.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
              {messages.results.map((message) => (
                <div key={message.id} className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3">
                  <p className="text-sm text-[var(--color-text)]">{message.body}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {message.sender_name} · {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

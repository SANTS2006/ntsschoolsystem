import { Send } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useCurrentUser } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { useCreateSubjectPrivateMessage, useSubjectPrivateMessages } from "./useAcademicsCrud";

export function TeacherSubjectPrivateThreadPage() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: user } = useCurrentUser();

  const { data: messages, isLoading } = useSubjectPrivateMessages(id, studentId);
  const sendMessage = useCreateSubjectPrivateMessage();
  const [body, setBody] = useState("");

  const handleSend = () => {
    if (!id || !studentId || !body.trim()) return;
    sendMessage.mutate(
      { subject_offering: id, student: studentId, body: body.trim() },
      {
        onSuccess: () => {
          showToast({ title: "Message sent" });
          setBody("");
        },
        onError: (err: ApiError) => showToast({ title: "Could not send", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  const studentName = messages?.results[0]?.student_name;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(`/academics/subject-offerings/${id}/students`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to roster
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {studentName ? `Private message — ${studentName}` : "Private message"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Only visible to you and this student.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!messages || messages.results.length === 0 ? (
            <EmptyState title="No messages yet" description="Send the first message below." />
          ) : (
            <div className="flex flex-col gap-2">
              {messages.results.map((message) => {
                const isMine = message.sender === user?.id;
                return (
                  <div
                    key={message.id}
                    className={`max-w-[80%] rounded-[var(--radius-md)] p-3 text-sm ${
                      isMine
                        ? "self-end bg-[var(--color-primary)]/10 text-[var(--color-text)]"
                        : "self-start bg-[var(--color-bg-subtle)] text-[var(--color-text)]"
                    }`}
                  >
                    <p>{message.body}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {message.sender_name} · {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Write a message..."
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
            />
            <Button onClick={handleSend} disabled={!body.trim()} isLoading={sendMessage.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

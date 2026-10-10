import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useCurrentUser } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import {
  useMySubjectMessages,
  useMySubjectPrivateMessages,
  useSendMySubjectMessage,
  useSendMySubjectPrivateMessage,
} from "./useAcademicsCrud";

export function MySubjectCommunicationsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { showToast } = useToast();
  const { data: user } = useCurrentUser();

  const { data: messages, isLoading: isLoadingMessages } = useMySubjectMessages(id);
  const { data: privateMessages, isLoading: isLoadingPrivate } = useMySubjectPrivateMessages(id);
  const sendPrivateMessage = useSendMySubjectPrivateMessage(id ?? "");
  const sendMessage = useSendMySubjectMessage(id ?? "");
  const [reply, setReply] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const isLoaded = !isLoadingMessages && !isLoadingPrivate;

  // A deep link from the subject card ("#messages") lands on this page directly (there's only
  // one section now that materials moved to the Lessons page), so nothing to scroll to besides
  // the top — kept for any old bookmarked links with a hash.
  useEffect(() => {
    if (hash && isLoaded) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, isLoaded]);

  const handleReply = () => {
    if (!reply.trim()) return;
    sendPrivateMessage.mutate(reply.trim(), {
      onSuccess: () => setReply(""),
      onError: (err: ApiError) => showToast({ title: "Could not send", description: err.message, tone: "danger" }),
    });
  };

  const handleSendMessage = () => {
    if (!announcement.trim()) return;
    sendMessage.mutate(announcement.trim(), {
      onSuccess: () => setAnnouncement(""),
      onError: (err: ApiError) => showToast({ title: "Could not send", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/my-subjects")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to subjects
      </button>

      <Card id="announcements" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Class messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoadingMessages ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !messages || messages.length === 0 ? (
            <EmptyState title="No messages yet" description="Be the first to say something to the class." />
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((message) => (
                <div key={message.id} className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3">
                  <p className="text-sm text-[var(--color-text)]">{message.body}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {message.sender_name} · {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
            <textarea
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              rows={2}
              placeholder="Write a message to your class..."
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
            />
            <Button onClick={handleSendMessage} disabled={!announcement.trim()} isLoading={sendMessage.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="messages" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Private messages with your teacher</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoadingPrivate ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !privateMessages || privateMessages.length === 0 ? (
            <EmptyState title="No messages yet" description="Your teacher may message you here." />
          ) : (
            <div className="flex flex-col gap-2">
              {privateMessages.map((message) => {
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
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Write a message to your teacher..."
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
            />
            <Button onClick={handleReply} disabled={!reply.trim()} isLoading={sendPrivateMessage.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

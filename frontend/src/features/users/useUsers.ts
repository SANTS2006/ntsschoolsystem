import { useMutation } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { inviteUser } from "./api";
import type { InviteUserPayload, InvitedUser } from "./types";

export function useInviteUser() {
  return useMutation<InvitedUser, ApiError, InviteUserPayload>({
    mutationFn: inviteUser,
  });
}

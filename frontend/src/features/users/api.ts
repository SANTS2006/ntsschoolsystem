import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { InviteUserPayload, InvitedUser, UserLookup } from "./types";

interface InviteResponse {
  success: boolean;
  message: string;
  user: InvitedUser;
  email_sent?: boolean;
}

export async function inviteUser(payload: InviteUserPayload): Promise<InvitedUser> {
  const { data } = await apiClient.post<InviteResponse>("/users/invite/", payload);
  return { ...data.user, email_sent: data.email_sent };
}

// A generous page_size — schools have a modest number of user accounts, so one request is
// enough to populate a dropdown; no pagination UI needed here. Requires `users.view`, which not
// every role holding `communications.*` also has (e.g. teacher) — see Communications' recipient
// picker for the resulting UX gap.
const LOOKUP_PAGE_SIZE = { page_size: 100 };

export async function listUsers(): Promise<UserLookup[]> {
  const { data } = await apiClient.get<PaginatedResponse<UserLookup>>("/users/", {
    params: LOOKUP_PAGE_SIZE,
  });
  return data.results;
}

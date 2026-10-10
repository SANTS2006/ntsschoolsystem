/** The only user-creation path in this system — accounts are always invited (unusable
 * password + an activation email), never created with an admin-chosen password. */
export interface InviteUserPayload {
  email: string;
  first_name: string;
  last_name: string;
  role_id?: string;
}

/** Enough of the invite response to link the new account to a Staff (or future Student/
 * Parent) profile right away — not the full `User` model. */
export interface InvitedUser {
  id: string;
  email: string;
  full_name: string;
  /** False when the account was created but the sign-in email could not be delivered. */
  email_sent?: boolean;
}

export interface UserLookup {
  id: string;
  full_name: string;
  email: string;
}

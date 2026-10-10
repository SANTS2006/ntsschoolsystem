import { apiClient } from "@/lib/api-client";

/** Who an event or announcement is for. `everybody`: all users; `groups`: chosen classes (and sections of them) and/or
 * departments; `specific`: people picked from a list or typed as e-mail addresses. */
export type AudienceType = "all" | "groups" | "specific";

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface AudienceValue {
  type: AudienceType;
  classes: string[];
  sections: string[];
  departments: string[];
  includeParents: boolean;
  people: Person[];
  emails: string;
  /** true: only the audience (and the creator) can see the item. false: everyone who may view the module can. */
  restricted: boolean;
}

export const EMPTY_AUDIENCE: AudienceValue = {
  type: "all",
  classes: [],
  sections: [],
  departments: [],
  includeParents: false,
  people: [],
  emails: "",
  restricted: false,
};

/** The fields the API takes for an audience (merge into the form's payload). */
export interface AudiencePayload {
  audience_type: AudienceType;
  audience_classes: string[];
  audience_sections: string[];
  audience_departments: string[];
  audience_users: string[];
  audience_emails: string;
  include_parents: boolean;
  restricted_to_audience: boolean;
}

export function audienceToPayload(value: AudienceValue): AudiencePayload {
  const groups = value.type === "groups";
  return {
    audience_type: value.type,
    audience_classes: groups ? value.classes : [],
    // A section only means something together with its class.
    audience_sections: groups ? value.sections : [],
    audience_departments: groups ? value.departments : [],
    audience_users: value.type === "specific" ? value.people.map((p) => p.id) : [],
    audience_emails: value.type === "specific" ? value.emails.trim() : "",
    include_parents: groups && value.classes.length > 0 ? value.includeParents : false,
    restricted_to_audience: value.restricted,
  };
}

/** What the API returns for an item's audience (the fields an event / announcement carries). */
export interface AudienceFromApi {
  audience_type: AudienceType | "legacy";
  audience_classes: string[];
  audience_sections: string[];
  audience_departments: string[];
  audience_users: string[];
  include_parents: boolean;
  restricted_to_audience: boolean;
}

export function audienceFromApi(item: AudienceFromApi | undefined): AudienceValue {
  if (!item || item.audience_type === "legacy") return EMPTY_AUDIENCE;
  return {
    type: item.audience_type,
    classes: item.audience_classes,
    sections: item.audience_sections,
    departments: item.audience_departments,
    includeParents: item.include_parents,
    // The people were saved by id; their names are looked up again when the picker needs them.
    people: item.audience_users.map((id) => ({ id, name: "", email: "" })),
    emails: "",
    restricted: item.restricted_to_audience,
  };
}

export interface AudienceOptions {
  classes: { id: string; name: string }[];
  sections: { id: string; name: string; school_class: string; school_class_name: string }[];
  departments: { id: string; name: string }[];
  roles: { id: string; name: string; slug: string }[];
}

export async function fetchAudienceOptions(): Promise<AudienceOptions> {
  const { data } = await apiClient.get<AudienceOptions>("/audience/options/");
  return data;
}

export async function fetchAudiencePeople(params: { search?: string; role?: string }): Promise<Person[]> {
  const { data } = await apiClient.get<{ people: Person[] }>("/audience/people/", { params });
  return data.people;
}

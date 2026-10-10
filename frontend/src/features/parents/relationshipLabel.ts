import type { GuardianRelationship } from "./types";

export function relationshipLabel(relationship: GuardianRelationship): string {
  return relationship[0].toUpperCase() + relationship.slice(1);
}

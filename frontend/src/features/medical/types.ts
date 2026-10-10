export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
export type VisitType = "routine" | "incident" | "emergency";

export interface MedicalProfile {
  id: string;
  student: string;
  student_name: string;
  blood_group: BloodGroup;
  allergies: string;
  chronic_conditions: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalProfilePayload {
  student: string;
  blood_group?: BloodGroup;
  allergies?: string;
  chronic_conditions?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
}

export interface MedicalProfileListParams {
  student?: string;
  blood_group?: BloodGroup;
  page?: number;
  page_size?: number;
}

export interface MedicalVisit {
  id: string;
  student: string;
  student_name: string;
  attended_by: string | null;
  attended_by_name: string | null;
  visit_type: VisitType;
  visited_at: string;
  symptoms: string;
  treatment: string;
  notes: string;
  parent_notified: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalVisitPayload {
  student: string;
  attended_by?: string;
  visit_type?: VisitType;
  visited_at: string;
  symptoms?: string;
  treatment?: string;
  notes?: string;
  parent_notified?: boolean;
}

export interface MedicalVisitListParams {
  student?: string;
  visit_type?: VisitType;
  page?: number;
  page_size?: number;
}

export interface MyMedical {
  profile: MedicalProfile | null;
  visits: MedicalVisit[];
}

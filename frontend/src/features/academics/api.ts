import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  AcademicYear,
  AcademicYearPayload,
  Assessment,
  AssessmentListParams,
  AssessmentPayload,
  AssessmentScoresResponse,
  GraduationStatus,
  BulkPromotePayload,
  BulkResultTransitionPayload,
  BulkResultTransitionResult,
  ClassOverallResultRow,
  ClassTermResultRow,
  Department,
  DepartmentPayload,
  ManualPromotePayload,
  MyResultSummary,
  AssessmentSubmissions,
  MySubjectCA,
  SubmittedFile,
  PromotionRecord,
  PromotionRecordListParams,
  SaveAssessmentScoresPayload,
  SaveSubjectResultsPayload,
  SchoolClass,
  SchoolClassPayload,
  Section,
  SectionListParams,
  SectionPayload,
  StudentSubjectEnrollment,
  StudentSubjectEnrollmentListParams,
  StudentSubjectEnrollmentPayload,
  Subject,
  SubjectListParams,
  SubjectMaterial,
  SubjectMaterialPayload,
  SubjectMessage,
  SubjectMessagePayload,
  SubjectOffering,
  SubjectOfferingListParams,
  SubjectOfferingPayload,
  SubjectPayload,
  SubjectPrivateMessage,
  SubjectPrivateMessagePayload,
  SubjectResultsResponse,
  Term,
  TermListParams,
  TermReport,
  TermResultPublication,
  TermResultPublicationListParams,
  TermPayload,
} from "./types";

// A generous page_size — schools have a handful of classes/sections/years, so
// one request is enough to populate a dropdown; no pagination UI needed here.
const LOOKUP_PAGE_SIZE = { page_size: 100 };

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const { data } = await apiClient.get<PaginatedResponse<AcademicYear>>("/academics/academic-years/", {
    params: LOOKUP_PAGE_SIZE,
  });
  return data.results;
}

export async function listSchoolClasses(): Promise<SchoolClass[]> {
  const { data } = await apiClient.get<PaginatedResponse<SchoolClass>>("/academics/classes/", {
    params: LOOKUP_PAGE_SIZE,
  });
  return data.results;
}

export async function listSections(params?: SectionListParams): Promise<Section[]> {
  const { data } = await apiClient.get<PaginatedResponse<Section>>("/academics/sections/", {
    params: { ...LOOKUP_PAGE_SIZE, ...params },
  });
  return data.results;
}

export async function listSubjects(): Promise<Subject[]> {
  const { data } = await apiClient.get<PaginatedResponse<Subject>>("/academics/subjects/", {
    params: LOOKUP_PAGE_SIZE,
  });
  return data.results;
}

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

export async function fetchAcademicYears(params: PageParams): Promise<PaginatedResponse<AcademicYear>> {
  const { data } = await apiClient.get<PaginatedResponse<AcademicYear>>("/academics/academic-years/", { params });
  return data;
}

export async function getAcademicYear(id: string): Promise<AcademicYear> {
  const { data } = await apiClient.get<AcademicYear>(`/academics/academic-years/${id}/`);
  return data;
}

export async function createAcademicYear(values: AcademicYearPayload): Promise<AcademicYear> {
  const { data } = await apiClient.post<AcademicYear>("/academics/academic-years/", values);
  return data;
}

export async function updateAcademicYear(id: string, values: AcademicYearPayload): Promise<AcademicYear> {
  const { data } = await apiClient.patch<AcademicYear>(`/academics/academic-years/${id}/`, values);
  return data;
}

export async function archiveAcademicYear(id: string): Promise<AcademicYear> {
  const { data } = await apiClient.post<{ academic_year: AcademicYear }>(`/academics/academic-years/${id}/archive/`);
  return data.academic_year;
}

export async function unarchiveAcademicYear(id: string): Promise<AcademicYear> {
  const { data } = await apiClient.post<{ academic_year: AcademicYear }>(`/academics/academic-years/${id}/unarchive/`);
  return data.academic_year;
}

export async function deleteAcademicYear(id: string): Promise<void> {
  await apiClient.delete(`/academics/academic-years/${id}/`);
}

export async function fetchTerms(params: PageParams & TermListParams): Promise<PaginatedResponse<Term>> {
  const { data } = await apiClient.get<PaginatedResponse<Term>>("/academics/terms/", { params });
  return data;
}

export async function getTerm(id: string): Promise<Term> {
  const { data } = await apiClient.get<Term>(`/academics/terms/${id}/`);
  return data;
}

export async function createTerm(values: TermPayload): Promise<Term> {
  const { data } = await apiClient.post<Term>("/academics/terms/", values);
  return data;
}

export async function updateTerm(id: string, values: TermPayload): Promise<Term> {
  const { data } = await apiClient.patch<Term>(`/academics/terms/${id}/`, values);
  return data;
}

export async function deleteTerm(id: string): Promise<void> {
  await apiClient.delete(`/academics/terms/${id}/`);
}

export async function fetchDepartments(params: PageParams): Promise<PaginatedResponse<Department>> {
  const { data } = await apiClient.get<PaginatedResponse<Department>>("/academics/departments/", { params });
  return data;
}

export async function getDepartment(id: string): Promise<Department> {
  const { data } = await apiClient.get<Department>(`/academics/departments/${id}/`);
  return data;
}

export async function createDepartment(values: DepartmentPayload): Promise<Department> {
  const { data } = await apiClient.post<Department>("/academics/departments/", values);
  return data;
}

export async function updateDepartment(id: string, values: DepartmentPayload): Promise<Department> {
  const { data } = await apiClient.patch<Department>(`/academics/departments/${id}/`, values);
  return data;
}

export async function deleteDepartment(id: string): Promise<void> {
  await apiClient.delete(`/academics/departments/${id}/`);
}

export async function fetchSubjects(params: PageParams & SubjectListParams): Promise<PaginatedResponse<Subject>> {
  const { data } = await apiClient.get<PaginatedResponse<Subject>>("/academics/subjects/", { params });
  return data;
}

export async function getSubject(id: string): Promise<Subject> {
  const { data } = await apiClient.get<Subject>(`/academics/subjects/${id}/`);
  return data;
}

export async function createSubject(values: SubjectPayload): Promise<Subject> {
  const { data } = await apiClient.post<Subject>("/academics/subjects/", values);
  return data;
}

export async function updateSubject(id: string, values: SubjectPayload): Promise<Subject> {
  const { data } = await apiClient.patch<Subject>(`/academics/subjects/${id}/`, values);
  return data;
}

export async function deleteSubject(id: string): Promise<void> {
  await apiClient.delete(`/academics/subjects/${id}/`);
}

export async function fetchSubjectOfferings(
  params: PageParams & SubjectOfferingListParams,
): Promise<PaginatedResponse<SubjectOffering>> {
  const { data } = await apiClient.get<PaginatedResponse<SubjectOffering>>("/academics/subject-offerings/", {
    params,
  });
  return data;
}

export async function getSubjectOffering(id: string): Promise<SubjectOffering> {
  const { data } = await apiClient.get<SubjectOffering>(`/academics/subject-offerings/${id}/`);
  return data;
}

export async function createSubjectOffering(values: SubjectOfferingPayload): Promise<SubjectOffering> {
  const { data } = await apiClient.post<SubjectOffering>("/academics/subject-offerings/", values);
  return data;
}

export async function updateSubjectOffering(id: string, values: SubjectOfferingPayload): Promise<SubjectOffering> {
  const { data } = await apiClient.patch<SubjectOffering>(`/academics/subject-offerings/${id}/`, values);
  return data;
}

export interface CaBreakdownRow {
  assessment: string;
  name: string;
  weight: number;
  discretionary_weight: number;
  max_score: string;
  raw_score: string | null;
  discretionary_mark: string | null;
  weighted_score: string | null;
  status: "draft" | "submitted" | null;
}

export interface CaStudentSummary {
  student: string;
  student_name: string;
  admission_number: string;
  total_ca: string | null;
  breakdown: CaBreakdownRow[];
}

export async function fetchSubjectOfferingCaSummary(
  id: string,
): Promise<{ ca_weight_percent: number; students: CaStudentSummary[] }> {
  const { data } = await apiClient.get<{ ca_weight_percent: number; students: CaStudentSummary[] }>(
    `/academics/subject-offerings/${id}/ca-summary/`,
  );
  return data;
}

export async function deleteSubjectOffering(id: string): Promise<void> {
  await apiClient.delete(`/academics/subject-offerings/${id}/`);
}

export async function uploadSubjectOfferingCoverImage(id: string, file: File): Promise<SubjectOffering> {
  const formData = new FormData();
  formData.append("cover_image", file);
  const { data } = await apiClient.post<{ subject_offering: SubjectOffering }>(
    `/academics/subject-offerings/${id}/cover-image/`,
    formData,
  );
  return data.subject_offering;
}

export async function closeSubjectOfferingCA(id: string): Promise<SubjectOffering> {
  const { data } = await apiClient.post<{ subject_offering: SubjectOffering }>(
    `/academics/subject-offerings/${id}/close-ca/`,
  );
  return data.subject_offering;
}

export async function reopenSubjectOfferingCA(id: string, reason: string): Promise<SubjectOffering> {
  const { data } = await apiClient.post<{ subject_offering: SubjectOffering }>(
    `/academics/subject-offerings/${id}/reopen-ca/`,
    { reason },
  );
  return data.subject_offering;
}

export async function fetchAssessments(
  params: PageParams & AssessmentListParams,
): Promise<PaginatedResponse<Assessment>> {
  const { data } = await apiClient.get<PaginatedResponse<Assessment>>("/academics/assessments/", { params });
  return data;
}

export async function getAssessment(id: string): Promise<Assessment> {
  const { data } = await apiClient.get<Assessment>(`/academics/assessments/${id}/`);
  return data;
}

export async function createAssessment(values: AssessmentPayload): Promise<Assessment> {
  const { data } = await apiClient.post<Assessment>("/academics/assessments/", values);
  return data;
}

export async function updateAssessment(id: string, values: AssessmentPayload): Promise<Assessment> {
  const { data } = await apiClient.patch<Assessment>(`/academics/assessments/${id}/`, values);
  return data;
}

export async function deleteAssessment(id: string): Promise<void> {
  await apiClient.delete(`/academics/assessments/${id}/`);
}

export async function fetchAssessmentScores(assessmentId: string): Promise<AssessmentScoresResponse> {
  const { data } = await apiClient.get<AssessmentScoresResponse>(`/academics/assessments/${assessmentId}/scores/`);
  return data;
}

export async function saveAssessmentScores(
  assessmentId: string,
  values: SaveAssessmentScoresPayload,
): Promise<void> {
  await apiClient.post(`/academics/assessments/${assessmentId}/scores/`, values);
}

export async function fetchMySubjectCA(subjectOfferingId: string): Promise<MySubjectCA> {
  const { data } = await apiClient.get<MySubjectCA>(`/academics/my-subjects/${subjectOfferingId}/ca/`);
  return data;
}

export async function fetchSubjectResults(subjectOfferingId: string): Promise<SubjectResultsResponse> {
  const { data } = await apiClient.get<SubjectResultsResponse>(
    `/academics/subject-offerings/${subjectOfferingId}/results/`,
  );
  return data;
}

export async function saveSubjectResults(
  subjectOfferingId: string,
  values: SaveSubjectResultsPayload,
): Promise<void> {
  await apiClient.post(`/academics/subject-offerings/${subjectOfferingId}/results/`, values);
}

export async function fetchSubjectEnrollments(
  params: PageParams & StudentSubjectEnrollmentListParams,
): Promise<PaginatedResponse<StudentSubjectEnrollment>> {
  const { data } = await apiClient.get<PaginatedResponse<StudentSubjectEnrollment>>(
    "/academics/subject-enrollments/",
    { params },
  );
  return data;
}

export async function createSubjectEnrollment(
  values: StudentSubjectEnrollmentPayload,
): Promise<StudentSubjectEnrollment> {
  const { data } = await apiClient.post<StudentSubjectEnrollment>("/academics/subject-enrollments/", values);
  return data;
}

export async function deleteSubjectEnrollment(id: string): Promise<void> {
  await apiClient.delete(`/academics/subject-enrollments/${id}/`);
}

export async function fetchMySubjects(): Promise<SubjectOffering[]> {
  const { data } = await apiClient.get<{ subjects: SubjectOffering[] }>("/academics/my-subjects/");
  return data.subjects;
}

export async function fetchSchoolClasses(params: PageParams): Promise<PaginatedResponse<SchoolClass>> {
  const { data } = await apiClient.get<PaginatedResponse<SchoolClass>>("/academics/classes/", { params });
  return data;
}

export async function getSchoolClass(id: string): Promise<SchoolClass> {
  const { data } = await apiClient.get<SchoolClass>(`/academics/classes/${id}/`);
  return data;
}

export async function createSchoolClass(values: SchoolClassPayload): Promise<SchoolClass> {
  const { data } = await apiClient.post<SchoolClass>("/academics/classes/", values);
  return data;
}

export async function updateSchoolClass(id: string, values: SchoolClassPayload): Promise<SchoolClass> {
  const { data } = await apiClient.patch<SchoolClass>(`/academics/classes/${id}/`, values);
  return data;
}

export async function deleteSchoolClass(id: string): Promise<void> {
  await apiClient.delete(`/academics/classes/${id}/`);
}

export async function fetchSections(params: PageParams & SectionListParams): Promise<PaginatedResponse<Section>> {
  const { data } = await apiClient.get<PaginatedResponse<Section>>("/academics/sections/", { params });
  return data;
}

export async function getSection(id: string): Promise<Section> {
  const { data } = await apiClient.get<Section>(`/academics/sections/${id}/`);
  return data;
}

export async function createSection(values: SectionPayload): Promise<Section> {
  const { data } = await apiClient.post<Section>("/academics/sections/", values);
  return data;
}

export async function updateSection(id: string, values: SectionPayload): Promise<Section> {
  const { data } = await apiClient.patch<Section>(`/academics/sections/${id}/`, values);
  return data;
}

export async function deleteSection(id: string): Promise<void> {
  await apiClient.delete(`/academics/sections/${id}/`);
}

export async function fetchClassTermResults(
  schoolClassId: string,
  termId: string,
): Promise<{ rows: ClassTermResultRow[] }> {
  const { data } = await apiClient.get<{ rows: ClassTermResultRow[] }>(
    `/academics/classes/${schoolClassId}/term-results/`,
    { params: { term: termId } },
  );
  return data;
}

export async function fetchClassOverallResults(
  schoolClassId: string,
  academicYearId: string,
): Promise<{ rows: ClassOverallResultRow[] }> {
  const { data } = await apiClient.get<{ rows: ClassOverallResultRow[] }>(
    `/academics/classes/${schoolClassId}/overall-results/`,
    { params: { academic_year: academicYearId } },
  );
  return data;
}

export async function bulkPromote(
  values: BulkPromotePayload,
): Promise<{ records: PromotionRecord[]; skipped_count: number }> {
  const { data } = await apiClient.post<{ records: PromotionRecord[]; skipped_count: number }>(
    "/academics/promotions/bulk-promote/",
    values,
  );
  return data;
}

export async function manualPromote(values: ManualPromotePayload): Promise<PromotionRecord> {
  const { data } = await apiClient.post<{ record: PromotionRecord }>(
    "/academics/promotions/manual-promote/",
    values,
  );
  return data.record;
}

export async function fetchPromotionRecords(
  params: PageParams & PromotionRecordListParams,
): Promise<PaginatedResponse<PromotionRecord>> {
  const { data } = await apiClient.get<PaginatedResponse<PromotionRecord>>("/academics/promotion-records/", {
    params,
  });
  return data;
}

export async function verifyTermResults(values: BulkResultTransitionPayload): Promise<BulkResultTransitionResult> {
  const { data } = await apiClient.post<BulkResultTransitionResult>("/academics/results/verify/", values);
  return data;
}

export async function publishTermResults(values: BulkResultTransitionPayload): Promise<BulkResultTransitionResult> {
  const { data } = await apiClient.post<BulkResultTransitionResult>("/academics/results/publish/", values);
  return data;
}

export async function lockTermResults(values: BulkResultTransitionPayload): Promise<BulkResultTransitionResult> {
  const { data } = await apiClient.post<BulkResultTransitionResult>("/academics/results/lock/", values);
  return data;
}

export async function fetchTermResultPublications(
  params: PageParams & TermResultPublicationListParams,
): Promise<PaginatedResponse<TermResultPublication>> {
  const { data } = await apiClient.get<PaginatedResponse<TermResultPublication>>(
    "/academics/result-publications/",
    { params },
  );
  return data;
}

export async function fetchStudentTermReport(
  studentId: string,
  schoolClassId: string,
  termId: string,
): Promise<TermReport> {
  const { data } = await apiClient.get<TermReport>(
    `/academics/results/students/${studentId}/classes/${schoolClassId}/terms/${termId}/`,
  );
  return data;
}

export async function fetchMyResults(): Promise<MyResultSummary[]> {
  const { data } = await apiClient.get<{ results: MyResultSummary[] }>("/academics/my-results/");
  return data.results;
}

export async function fetchMyResultDetail(schoolClassId: string, termId: string): Promise<TermReport> {
  const { data } = await apiClient.get<TermReport>(
    `/academics/my-results/classes/${schoolClassId}/terms/${termId}/`,
  );
  return data;
}

export async function fetchSubjectMaterials(
  params: PageParams & { subject_offering?: string },
): Promise<PaginatedResponse<SubjectMaterial>> {
  const { data } = await apiClient.get<PaginatedResponse<SubjectMaterial>>("/academics/subject-materials/", {
    params,
  });
  return data;
}

export async function createSubjectMaterial(
  values: SubjectMaterialPayload,
  onProgress?: (percent: number) => void,
): Promise<SubjectMaterial> {
  const formData = new FormData();
  formData.append("subject_offering", values.subject_offering);
  formData.append("title", values.title);
  formData.append("file", values.file);
  const { data } = await apiClient.post<SubjectMaterial>("/academics/subject-materials/", formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function deleteSubjectMaterial(id: string): Promise<void> {
  await apiClient.delete(`/academics/subject-materials/${id}/`);
}

export async function fetchSubjectMessages(
  params: PageParams & { subject_offering?: string },
): Promise<PaginatedResponse<SubjectMessage>> {
  const { data } = await apiClient.get<PaginatedResponse<SubjectMessage>>("/academics/subject-messages/", {
    params,
  });
  return data;
}

export async function createSubjectMessage(values: SubjectMessagePayload): Promise<SubjectMessage> {
  const { data } = await apiClient.post<SubjectMessage>("/academics/subject-messages/", values);
  return data;
}

export async function fetchSubjectPrivateMessages(
  params: PageParams & { subject_offering?: string; student?: string },
): Promise<PaginatedResponse<SubjectPrivateMessage>> {
  const { data } = await apiClient.get<PaginatedResponse<SubjectPrivateMessage>>(
    "/academics/subject-private-messages/",
    { params },
  );
  return data;
}

export async function createSubjectPrivateMessage(
  values: SubjectPrivateMessagePayload,
): Promise<SubjectPrivateMessage> {
  const { data } = await apiClient.post<SubjectPrivateMessage>("/academics/subject-private-messages/", values);
  return data;
}

export async function fetchMySubjectMaterials(subjectOfferingId: string): Promise<SubjectMaterial[]> {
  const { data } = await apiClient.get<{ materials: SubjectMaterial[] }>(
    `/academics/my-subjects/${subjectOfferingId}/materials/`,
  );
  return data.materials;
}

export async function fetchMySubjectMessages(subjectOfferingId: string): Promise<SubjectMessage[]> {
  const { data } = await apiClient.get<{ messages: SubjectMessage[] }>(
    `/academics/my-subjects/${subjectOfferingId}/messages/`,
  );
  return data.messages;
}

export async function sendMySubjectMessage(subjectOfferingId: string, body: string): Promise<SubjectMessage> {
  const { data } = await apiClient.post<SubjectMessage>(`/academics/my-subjects/${subjectOfferingId}/messages/`, {
    body,
  });
  return data;
}

export async function fetchMySubjectPrivateMessages(subjectOfferingId: string): Promise<SubjectPrivateMessage[]> {
  const { data } = await apiClient.get<{ messages: SubjectPrivateMessage[] }>(
    `/academics/my-subjects/${subjectOfferingId}/private-messages/`,
  );
  return data.messages;
}

export async function sendMySubjectPrivateMessage(
  subjectOfferingId: string,
  body: string,
): Promise<SubjectPrivateMessage> {
  const { data } = await apiClient.post<SubjectPrivateMessage>(
    `/academics/my-subjects/${subjectOfferingId}/private-messages/`,
    { body },
  );
  return data;
}

export async function fetchStudentGraduationStatus(studentId: string): Promise<GraduationStatus> {
  const { data } = await apiClient.get<GraduationStatus>(`/academics/students/${studentId}/graduation-status/`);
  return data;
}

export async function fetchMyGraduationStatus(): Promise<GraduationStatus> {
  const { data } = await apiClient.get<GraduationStatus>("/academics/my-graduation-status/");
  return data;
}

export async function fetchAssessmentSubmissions(assessmentId: string): Promise<AssessmentSubmissions> {
  const { data } = await apiClient.get<{ submissions: AssessmentSubmissions }>(`/academics/assessments/${assessmentId}/submissions/`);
  return data.submissions;
}

export async function uploadAssessmentFile(assessmentId: string, file: File): Promise<SubmittedFile> {
  const formData = new FormData();
  formData.append("assessment", assessmentId);
  formData.append("file", file);
  const { data } = await apiClient.post<{ file: SubmittedFile }>("/academics/my-assessment-files/", formData);
  return data.file;
}

export async function deleteAssessmentFile(fileId: string): Promise<void> {
  await apiClient.delete(`/academics/my-assessment-files/${fileId}/`);
}

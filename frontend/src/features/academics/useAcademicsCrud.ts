import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  archiveAcademicYear,
  bulkPromote,
  closeSubjectOfferingCA,
  createAcademicYear,
  createAssessment,
  createDepartment,
  createSchoolClass,
  createSection,
  createSubject,
  createSubjectEnrollment,
  createSubjectMaterial,
  createSubjectMessage,
  createSubjectOffering,
  fetchSubjectOfferingCaSummary,
  uploadSubjectOfferingCoverImage,
  createSubjectPrivateMessage,
  createTerm,
  deleteAcademicYear,
  deleteAssessment,
  deleteDepartment,
  deleteSchoolClass,
  deleteSection,
  deleteSubject,
  deleteSubjectEnrollment,
  deleteSubjectMaterial,
  deleteSubjectOffering,
  deleteTerm,
  unarchiveAcademicYear,
  fetchAcademicYears,
  fetchAssessments,
  fetchAssessmentScores,
  fetchClassOverallResults,
  fetchClassTermResults,
  fetchDepartments,
  fetchMyGraduationStatus,
  fetchMyResultDetail,
  fetchMyResults,
  fetchMySubjectCA,
  fetchAssessmentSubmissions,
  uploadAssessmentFile,
  deleteAssessmentFile,
  fetchMySubjectMaterials,
  fetchMySubjectMessages,
  sendMySubjectMessage,
  fetchMySubjectPrivateMessages,
  fetchMySubjects,
  fetchPromotionRecords,
  fetchSchoolClasses,
  fetchSections,
  fetchStudentTermReport,
  fetchSubjectEnrollments,
  fetchSubjectMaterials,
  fetchSubjectMessages,
  fetchSubjectOfferings,
  fetchSubjectPrivateMessages,
  fetchSubjects,
  fetchSubjectResults,
  fetchStudentGraduationStatus,
  fetchTermResultPublications,
  fetchTerms,
  getAcademicYear,
  getAssessment,
  getDepartment,
  getSchoolClass,
  getSection,
  getSubject,
  getSubjectOffering,
  getTerm,
  lockTermResults,
  manualPromote,
  publishTermResults,
  reopenSubjectOfferingCA,
  saveAssessmentScores,
  saveSubjectResults,
  sendMySubjectPrivateMessage,
  updateAcademicYear,
  updateAssessment,
  updateDepartment,
  updateSchoolClass,
  updateSection,
  updateSubject,
  updateSubjectOffering,
  updateTerm,
  verifyTermResults,
} from "./api";
import type {
  AcademicYear,
  AcademicYearPayload,
  Assessment,
  AssessmentListParams,
  AssessmentPayload,
  AssessmentScoresResponse,
  BulkPromotePayload,
  BulkResultTransitionPayload,
  BulkResultTransitionResult,
  ClassOverallResultRow,
  ClassTermResultRow,
  Department,
  DepartmentPayload,
  GraduationStatus,
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
  TermPayload,
  TermReport,
  TermResultPublicationListParams,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

const ACADEMIC_YEARS_KEY = ["academics", "academic-years", "records"] as const;
const TERMS_KEY = ["academics", "terms", "records"] as const;
const DEPARTMENTS_KEY = ["academics", "departments", "records"] as const;
const SUBJECTS_KEY = ["academics", "subjects", "records"] as const;
const SUBJECT_OFFERINGS_KEY = ["academics", "subject-offerings", "records"] as const;
const SUBJECT_ENROLLMENTS_KEY = ["academics", "subject-enrollments", "records"] as const;
const MY_SUBJECTS_KEY = ["academics", "my-subjects"] as const;
const ASSESSMENTS_KEY = ["academics", "assessments", "records"] as const;
const SCHOOL_CLASSES_KEY = ["academics", "classes", "records"] as const;
const SECTIONS_KEY = ["academics", "sections", "records"] as const;

export function useAcademicYearList(params: PageParams) {
  return useQuery({
    queryKey: [...ACADEMIC_YEARS_KEY, "list", params],
    queryFn: () => fetchAcademicYears(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAcademicYear(id: string | undefined) {
  return useQuery<AcademicYear, ApiError>({
    queryKey: [...ACADEMIC_YEARS_KEY, "detail", id],
    queryFn: () => getAcademicYear(id as string),
    enabled: !!id,
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation<AcademicYear, ApiError, AcademicYearPayload>({
    mutationFn: createAcademicYear,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateAcademicYear(id: string) {
  const queryClient = useQueryClient();
  return useMutation<AcademicYear, ApiError, AcademicYearPayload>({
    mutationFn: (values) => updateAcademicYear(id, values),
    onSuccess: (year) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...ACADEMIC_YEARS_KEY, "detail", id], year);
    },
  });
}

export function useDeleteAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAcademicYear,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useArchiveAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation<AcademicYear, ApiError, string>({
    mutationFn: archiveAcademicYear,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUnarchiveAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation<AcademicYear, ApiError, string>({
    mutationFn: unarchiveAcademicYear,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useTermList(params: PageParams & TermListParams) {
  return useQuery({
    queryKey: [...TERMS_KEY, "list", params],
    queryFn: () => fetchTerms(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useTerm(id: string | undefined) {
  return useQuery<Term, ApiError>({
    queryKey: [...TERMS_KEY, "detail", id],
    queryFn: () => getTerm(id as string),
    enabled: !!id,
  });
}

export function useCreateTerm() {
  const queryClient = useQueryClient();
  return useMutation<Term, ApiError, TermPayload>({
    mutationFn: createTerm,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateTerm(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Term, ApiError, TermPayload>({
    mutationFn: (values) => updateTerm(id, values),
    onSuccess: (term) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...TERMS_KEY, "detail", id], term);
    },
  });
}

export function useDeleteTerm() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteTerm,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useDepartmentList(params: PageParams) {
  return useQuery({
    queryKey: [...DEPARTMENTS_KEY, "list", params],
    queryFn: () => fetchDepartments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useDepartment(id: string | undefined) {
  return useQuery<Department, ApiError>({
    queryKey: [...DEPARTMENTS_KEY, "detail", id],
    queryFn: () => getDepartment(id as string),
    enabled: !!id,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation<Department, ApiError, DepartmentPayload>({
    mutationFn: createDepartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateDepartment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Department, ApiError, DepartmentPayload>({
    mutationFn: (values) => updateDepartment(id, values),
    onSuccess: (department) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...DEPARTMENTS_KEY, "detail", id], department);
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteDepartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useSubjectList(params: PageParams & SubjectListParams) {
  return useQuery({
    queryKey: [...SUBJECTS_KEY, "list", params],
    queryFn: () => fetchSubjects(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSubject(id: string | undefined) {
  return useQuery<Subject, ApiError>({
    queryKey: [...SUBJECTS_KEY, "detail", id],
    queryFn: () => getSubject(id as string),
    enabled: !!id,
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation<Subject, ApiError, SubjectPayload>({
    mutationFn: createSubject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateSubject(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Subject, ApiError, SubjectPayload>({
    mutationFn: (values) => updateSubject(id, values),
    onSuccess: (subject) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SUBJECTS_KEY, "detail", id], subject);
    },
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSubject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useSubjectOfferingList(params: PageParams & SubjectOfferingListParams) {
  return useQuery({
    queryKey: [...SUBJECT_OFFERINGS_KEY, "list", params],
    queryFn: () => fetchSubjectOfferings(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSubjectOffering(id: string | undefined) {
  return useQuery<SubjectOffering, ApiError>({
    queryKey: [...SUBJECT_OFFERINGS_KEY, "detail", id],
    queryFn: () => getSubjectOffering(id as string),
    enabled: !!id,
  });
}

export function useCreateSubjectOffering() {
  const queryClient = useQueryClient();
  return useMutation<SubjectOffering, ApiError, SubjectOfferingPayload>({
    mutationFn: createSubjectOffering,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateSubjectOffering(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SubjectOffering, ApiError, SubjectOfferingPayload>({
    mutationFn: (values) => updateSubjectOffering(id, values),
    onSuccess: (offering) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SUBJECT_OFFERINGS_KEY, "detail", id], offering);
    },
  });
}

export function useDeleteSubjectOffering() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSubjectOffering,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useSubjectOfferingCaSummary(id: string | undefined) {
  return useQuery({
    queryKey: [...SUBJECT_OFFERINGS_KEY, "ca-summary", id],
    queryFn: () => fetchSubjectOfferingCaSummary(id as string),
    enabled: !!id,
  });
}

export function useUploadSubjectOfferingCoverImage() {
  const queryClient = useQueryClient();
  return useMutation<SubjectOffering, ApiError, { id: string; file: File }>({
    mutationFn: ({ id, file }) => uploadSubjectOfferingCoverImage(id, file),
    onSuccess: (offering) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SUBJECT_OFFERINGS_KEY, "detail", offering.id], offering);
    },
  });
}

export function useCloseSubjectOfferingCA() {
  const queryClient = useQueryClient();
  return useMutation<SubjectOffering, ApiError, string>({
    mutationFn: closeSubjectOfferingCA,
    onSuccess: (offering) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SUBJECT_OFFERINGS_KEY, "detail", offering.id], offering);
    },
  });
}

export function useReopenSubjectOfferingCA() {
  const queryClient = useQueryClient();
  return useMutation<SubjectOffering, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => reopenSubjectOfferingCA(id, reason),
    onSuccess: (offering) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SUBJECT_OFFERINGS_KEY, "detail", offering.id], offering);
    },
  });
}

export function useSubjectEnrollmentList(params: PageParams & StudentSubjectEnrollmentListParams) {
  return useQuery({
    queryKey: [...SUBJECT_ENROLLMENTS_KEY, "list", params],
    queryFn: () => fetchSubjectEnrollments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateSubjectEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<StudentSubjectEnrollment, ApiError, StudentSubjectEnrollmentPayload>({
    mutationFn: createSubjectEnrollment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBJECT_ENROLLMENTS_KEY }),
  });
}

export function useDeleteSubjectEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSubjectEnrollment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBJECT_ENROLLMENTS_KEY }),
  });
}

export function useMySubjects() {
  return useQuery<SubjectOffering[], ApiError>({
    queryKey: MY_SUBJECTS_KEY,
    queryFn: fetchMySubjects,
  });
}

export function useMySubjectCA(subjectOfferingId: string | undefined) {
  return useQuery<MySubjectCA, ApiError>({
    queryKey: [...MY_SUBJECTS_KEY, subjectOfferingId, "ca"],
    queryFn: () => fetchMySubjectCA(subjectOfferingId as string),
    enabled: !!subjectOfferingId,
  });
}

export function useSubjectResults(subjectOfferingId: string | undefined) {
  return useQuery<SubjectResultsResponse, ApiError>({
    queryKey: [...SUBJECT_OFFERINGS_KEY, subjectOfferingId, "results"],
    queryFn: () => fetchSubjectResults(subjectOfferingId as string),
    enabled: !!subjectOfferingId,
  });
}

export function useSaveSubjectResults(subjectOfferingId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, SaveSubjectResultsPayload>({
    mutationFn: (values) => saveSubjectResults(subjectOfferingId, values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...SUBJECT_OFFERINGS_KEY, subjectOfferingId, "results"] }),
  });
}

export function useAssessmentList(params: PageParams & AssessmentListParams) {
  return useQuery({
    queryKey: [...ASSESSMENTS_KEY, "list", params],
    queryFn: () => fetchAssessments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAssessment(id: string | undefined) {
  return useQuery<Assessment, ApiError>({
    queryKey: [...ASSESSMENTS_KEY, "detail", id],
    queryFn: () => getAssessment(id as string),
    enabled: !!id,
  });
}

export function useCreateAssessment() {
  const queryClient = useQueryClient();
  return useMutation<Assessment, ApiError, AssessmentPayload>({
    mutationFn: createAssessment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateAssessment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Assessment, ApiError, AssessmentPayload>({
    mutationFn: (values) => updateAssessment(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useDeleteAssessment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAssessment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useAssessmentScores(assessmentId: string | undefined) {
  return useQuery<AssessmentScoresResponse, ApiError>({
    queryKey: [...ASSESSMENTS_KEY, assessmentId, "scores"],
    queryFn: () => fetchAssessmentScores(assessmentId as string),
    enabled: !!assessmentId,
  });
}

export function useSaveAssessmentScores(assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, SaveAssessmentScoresPayload>({
    mutationFn: (values) => saveAssessmentScores(assessmentId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...ASSESSMENTS_KEY, assessmentId, "scores"] }),
  });
}

export function useSchoolClassList(params: PageParams) {
  return useQuery({
    queryKey: [...SCHOOL_CLASSES_KEY, "list", params],
    queryFn: () => fetchSchoolClasses(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSchoolClass(id: string | undefined) {
  return useQuery<SchoolClass, ApiError>({
    queryKey: [...SCHOOL_CLASSES_KEY, "detail", id],
    queryFn: () => getSchoolClass(id as string),
    enabled: !!id,
  });
}

export function useCreateSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation<SchoolClass, ApiError, SchoolClassPayload>({
    mutationFn: createSchoolClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateSchoolClass(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SchoolClass, ApiError, SchoolClassPayload>({
    mutationFn: (values) => updateSchoolClass(id, values),
    onSuccess: (schoolClass) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SCHOOL_CLASSES_KEY, "detail", id], schoolClass);
    },
  });
}

export function useDeleteSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSchoolClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useSectionList(params: PageParams & SectionListParams) {
  return useQuery({
    queryKey: [...SECTIONS_KEY, "list", params],
    queryFn: () => fetchSections(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSection(id: string | undefined) {
  return useQuery<Section, ApiError>({
    queryKey: [...SECTIONS_KEY, "detail", id],
    queryFn: () => getSection(id as string),
    enabled: !!id,
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation<Section, ApiError, SectionPayload>({
    mutationFn: createSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useUpdateSection(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Section, ApiError, SectionPayload>({
    mutationFn: (values) => updateSection(id, values),
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: ["academics"] });
      queryClient.setQueryData([...SECTIONS_KEY, "detail", id], section);
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useClassTermResults(schoolClassId: string | undefined, termId: string | undefined) {
  return useQuery<{ rows: ClassTermResultRow[] }, ApiError>({
    queryKey: ["academics", "classes", schoolClassId, "term-results", termId],
    queryFn: () => fetchClassTermResults(schoolClassId as string, termId as string),
    enabled: !!schoolClassId && !!termId,
  });
}

export function useClassOverallResults(schoolClassId: string | undefined, academicYearId: string | undefined) {
  return useQuery<{ rows: ClassOverallResultRow[] }, ApiError>({
    queryKey: ["academics", "classes", schoolClassId, "overall-results", academicYearId],
    queryFn: () => fetchClassOverallResults(schoolClassId as string, academicYearId as string),
    enabled: !!schoolClassId && !!academicYearId,
  });
}

export function useBulkPromote() {
  const queryClient = useQueryClient();
  return useMutation<{ records: PromotionRecord[]; skipped_count: number }, ApiError, BulkPromotePayload>({
    mutationFn: bulkPromote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useManualPromote() {
  const queryClient = useQueryClient();
  return useMutation<PromotionRecord, ApiError, ManualPromotePayload>({
    mutationFn: manualPromote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function usePromotionRecords(params: PageParams & PromotionRecordListParams) {
  return useQuery({
    queryKey: ["academics", "promotion-records", "list", params],
    queryFn: () => fetchPromotionRecords(params),
    placeholderData: (previousData) => previousData,
  });
}

function useResultTransitionMutation(mutationFn: (values: BulkResultTransitionPayload) => Promise<BulkResultTransitionResult>) {
  const queryClient = useQueryClient();
  return useMutation<BulkResultTransitionResult, ApiError, BulkResultTransitionPayload>({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics"] }),
  });
}

export function useVerifyTermResults() {
  return useResultTransitionMutation(verifyTermResults);
}

export function usePublishTermResults() {
  return useResultTransitionMutation(publishTermResults);
}

export function useLockTermResults() {
  return useResultTransitionMutation(lockTermResults);
}

export function useTermResultPublications(params: PageParams & TermResultPublicationListParams) {
  return useQuery({
    queryKey: ["academics", "result-publications", "list", params],
    queryFn: () => fetchTermResultPublications(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useStudentTermReport(
  studentId: string | undefined,
  schoolClassId: string | undefined,
  termId: string | undefined,
) {
  return useQuery<TermReport, ApiError>({
    queryKey: ["academics", "results", "student-report", studentId, schoolClassId, termId],
    queryFn: () => fetchStudentTermReport(studentId as string, schoolClassId as string, termId as string),
    enabled: !!studentId && !!schoolClassId && !!termId,
  });
}

export function useMyResults() {
  return useQuery<MyResultSummary[], ApiError>({
    queryKey: ["academics", "my-results"],
    queryFn: fetchMyResults,
  });
}

export function useMyResultDetail(schoolClassId: string | undefined, termId: string | undefined) {
  return useQuery<TermReport, ApiError>({
    queryKey: ["academics", "my-results", schoolClassId, termId],
    queryFn: () => fetchMyResultDetail(schoolClassId as string, termId as string),
    enabled: !!schoolClassId && !!termId,
  });
}

export function useSubjectMaterials(subjectOfferingId: string | undefined) {
  return useQuery({
    queryKey: ["academics", "subject-materials", "list", subjectOfferingId],
    queryFn: () => fetchSubjectMaterials({ page_size: 100, subject_offering: subjectOfferingId }),
    enabled: !!subjectOfferingId,
  });
}

export function useCreateSubjectMaterial() {
  const queryClient = useQueryClient();
  return useMutation<
    SubjectMaterial,
    ApiError,
    { values: SubjectMaterialPayload; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ values, onProgress }) => createSubjectMaterial(values, onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics", "subject-materials"] }),
  });
}

export function useDeleteSubjectMaterial() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSubjectMaterial,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics", "subject-materials"] }),
  });
}

export function useSubjectMessages(subjectOfferingId: string | undefined) {
  return useQuery({
    queryKey: ["academics", "subject-messages", "list", subjectOfferingId],
    queryFn: () => fetchSubjectMessages({ page_size: 100, subject_offering: subjectOfferingId }),
    enabled: !!subjectOfferingId,
  });
}

export function useCreateSubjectMessage() {
  const queryClient = useQueryClient();
  return useMutation<SubjectMessage, ApiError, SubjectMessagePayload>({
    mutationFn: createSubjectMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics", "subject-messages"] }),
  });
}

export function useSubjectPrivateMessages(subjectOfferingId: string | undefined, studentId: string | undefined) {
  return useQuery({
    queryKey: ["academics", "subject-private-messages", "list", subjectOfferingId, studentId],
    queryFn: () =>
      fetchSubjectPrivateMessages({ page_size: 200, subject_offering: subjectOfferingId, student: studentId }),
    enabled: !!subjectOfferingId && !!studentId,
  });
}

export function useCreateSubjectPrivateMessage() {
  const queryClient = useQueryClient();
  return useMutation<SubjectPrivateMessage, ApiError, SubjectPrivateMessagePayload>({
    mutationFn: createSubjectPrivateMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academics", "subject-private-messages"] }),
  });
}

export function useMySubjectMaterials(subjectOfferingId: string | undefined) {
  return useQuery<SubjectMaterial[], ApiError>({
    queryKey: ["academics", "my-subjects", subjectOfferingId, "materials"],
    queryFn: () => fetchMySubjectMaterials(subjectOfferingId as string),
    enabled: !!subjectOfferingId,
  });
}

export function useMySubjectMessages(subjectOfferingId: string | undefined) {
  return useQuery<SubjectMessage[], ApiError>({
    queryKey: ["academics", "my-subjects", subjectOfferingId, "messages"],
    queryFn: () => fetchMySubjectMessages(subjectOfferingId as string),
    enabled: !!subjectOfferingId,
  });
}

export function useSendMySubjectMessage(subjectOfferingId: string) {
  const queryClient = useQueryClient();
  return useMutation<SubjectMessage, ApiError, string>({
    mutationFn: (body) => sendMySubjectMessage(subjectOfferingId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["academics", "my-subjects", subjectOfferingId, "messages"] }),
  });
}

export function useMySubjectPrivateMessages(subjectOfferingId: string | undefined) {
  return useQuery<SubjectPrivateMessage[], ApiError>({
    queryKey: ["academics", "my-subjects", subjectOfferingId, "private-messages"],
    queryFn: () => fetchMySubjectPrivateMessages(subjectOfferingId as string),
    enabled: !!subjectOfferingId,
  });
}

export function useSendMySubjectPrivateMessage(subjectOfferingId: string) {
  const queryClient = useQueryClient();
  return useMutation<SubjectPrivateMessage, ApiError, string>({
    mutationFn: (body) => sendMySubjectPrivateMessage(subjectOfferingId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["academics", "my-subjects", subjectOfferingId, "private-messages"],
      }),
  });
}

export function useStudentGraduationStatus(studentId: string | undefined) {
  return useQuery<GraduationStatus, ApiError>({
    queryKey: ["academics", "graduation-status", studentId],
    queryFn: () => fetchStudentGraduationStatus(studentId as string),
    enabled: !!studentId,
  });
}

export function useMyGraduationStatus() {
  return useQuery<GraduationStatus, ApiError>({
    queryKey: ["academics", "my-graduation-status"],
    queryFn: fetchMyGraduationStatus,
  });
}

export function useAssessmentSubmissions(assessmentId: string | undefined, enabled = true) {
  return useQuery<AssessmentSubmissions, ApiError>({
    queryKey: [...ASSESSMENTS_KEY, "submissions", assessmentId],
    queryFn: () => fetchAssessmentSubmissions(assessmentId as string),
    enabled: !!assessmentId && enabled,
  });
}

export function useUploadAssessmentFile() {
  const queryClient = useQueryClient();
  return useMutation<SubmittedFile, ApiError, { assessmentId: string; file: File }>({
    mutationFn: ({ assessmentId, file }) => uploadAssessmentFile(assessmentId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_SUBJECTS_KEY }),
  });
}

export function useDeleteAssessmentFile() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAssessmentFile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_SUBJECTS_KEY }),
  });
}

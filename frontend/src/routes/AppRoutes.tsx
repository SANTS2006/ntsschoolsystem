import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { FormModal } from "@/components/FormModal";

import { FullPageSpinner } from "@/components/ui/Spinner";
import { lazyRetry } from "@/lib/lazyRetry";
import { useSchoolSlug } from "@/lib/schoolSlug";

import { CategoriesListPage as DocumentCategoriesListPage } from "@/features/documents/CategoriesListPage";
import { CategoryFormPage as DocumentCategoryFormPage } from "@/features/documents/CategoryFormPage";
import { CategoriesListPage as InventoryCategoriesListPage } from "@/features/inventory/CategoriesListPage";
import { CategoryFormPage as InventoryCategoryFormPage } from "@/features/inventory/CategoryFormPage";
import { ItemFormPage as InventoryItemFormPage } from "@/features/inventory/ItemFormPage";
import { ItemsListPage as InventoryItemsListPage } from "@/features/inventory/ItemsListPage";
import { TransactionsListPage as InventoryTransactionsListPage } from "@/features/inventory/TransactionsListPage";
import { AccountLayout } from "@/layouts/AccountLayout";
import { AppShell } from "@/layouts/AppShell";
import { AuthLayout } from "@/layouts/AuthLayout";
import { PlatformShell } from "@/layouts/PlatformShell";

import { ProtectedRoute } from "./ProtectedRoute";

// Every page is its own chunk, fetched when first visited — the app shell stays small, which
// matters for an installable app opened from a phone's home screen.
const ApplicationDetailPage = lazyRetry(() => import("@/features/admissions/ApplicationDetailPage").then((m) => ({ default: m.ApplicationDetailPage })));
const ApplicationFormBuilderPage = lazyRetry(() => import("@/features/admissions/ApplicationFormBuilderPage").then((m) => ({ default: m.ApplicationFormBuilderPage })));
const ApplicationsListPage = lazyRetry(() => import("@/features/admissions/ApplicationsListPage").then((m) => ({ default: m.ApplicationsListPage })));
const PublicApplyPage = lazyRetry(() => import("@/features/admissions/PublicApplyPage").then((m) => ({ default: m.PublicApplyPage })));
const AcademicYearFormPage = lazyRetry(() => import("@/features/academics/AcademicYearFormPage").then((m) => ({ default: m.AcademicYearFormPage })));
const YearRolloverPage = lazyRetry(() => import("@/features/academics/YearRolloverPage").then((m) => ({ default: m.YearRolloverPage })));
const AcademicYearsListPage = lazyRetry(() => import("@/features/academics/AcademicYearsListPage").then((m) => ({ default: m.AcademicYearsListPage })));
const AcademicsLayout = lazyRetry(() => import("@/features/academics/AcademicsLayout").then((m) => ({ default: m.AcademicsLayout })));
const DepartmentFormPage = lazyRetry(() => import("@/features/academics/DepartmentFormPage").then((m) => ({ default: m.DepartmentFormPage })));
const DepartmentsListPage = lazyRetry(() => import("@/features/academics/DepartmentsListPage").then((m) => ({ default: m.DepartmentsListPage })));
const SchoolClassFormPage = lazyRetry(() => import("@/features/academics/SchoolClassFormPage").then((m) => ({ default: m.SchoolClassFormPage })));
const ClassResultsPage = lazyRetry(() => import("@/features/academics/ClassResultsPage").then((m) => ({ default: m.ClassResultsPage })));
const StudentGraduationStatusPage = lazyRetry(() => import("@/features/academics/StudentGraduationStatusPage").then((m) => ({ default: m.StudentGraduationStatusPage })));
const StudentTermReportPage = lazyRetry(() => import("@/features/academics/StudentTermReportPage").then((m) => ({ default: m.StudentTermReportPage })));
const SchoolClassesListPage = lazyRetry(() => import("@/features/academics/SchoolClassesListPage").then((m) => ({ default: m.SchoolClassesListPage })));
const SectionFormPage = lazyRetry(() => import("@/features/academics/SectionFormPage").then((m) => ({ default: m.SectionFormPage })));
const SectionsListPage = lazyRetry(() => import("@/features/academics/SectionsListPage").then((m) => ({ default: m.SectionsListPage })));
const SubjectFormPage = lazyRetry(() => import("@/features/academics/SubjectFormPage").then((m) => ({ default: m.SubjectFormPage })));
const SubjectsListPage = lazyRetry(() => import("@/features/academics/SubjectsListPage").then((m) => ({ default: m.SubjectsListPage })));
const AssessmentGradeEntryPage = lazyRetry(() => import("@/features/academics/AssessmentGradeEntryPage").then((m) => ({ default: m.AssessmentGradeEntryPage })));
const AssessmentDetailPage = lazyRetry(() => import("@/features/academics/AssessmentDetailPage").then((m) => ({ default: m.AssessmentDetailPage })));
const MyAssessmentDetailPage = lazyRetry(() => import("@/features/academics/MyAssessmentDetailPage").then((m) => ({ default: m.MyAssessmentDetailPage })));
const MySubjectCAPage = lazyRetry(() => import("@/features/academics/MySubjectCAPage").then((m) => ({ default: m.MySubjectCAPage })));
const MySubjectCommunicationsPage = lazyRetry(() => import("@/features/academics/MySubjectCommunicationsPage").then((m) => ({ default: m.MySubjectCommunicationsPage })));
const MySubjectLessonsPage = lazyRetry(() => import("@/features/academics/MySubjectLessonsPage").then((m) => ({ default: m.MySubjectLessonsPage })));
const MyResultDetailPage = lazyRetry(() => import("@/features/academics/MyResultDetailPage").then((m) => ({ default: m.MyResultDetailPage })));
const MyGraduationStatusPage = lazyRetry(() => import("@/features/academics/MyGraduationStatusPage").then((m) => ({ default: m.MyGraduationStatusPage })));
const MyResultsPage = lazyRetry(() => import("@/features/academics/MyResultsPage").then((m) => ({ default: m.MyResultsPage })));
const TeacherSubjectLessonsPage = lazyRetry(() => import("@/features/academics/TeacherSubjectLessonsPage").then((m) => ({ default: m.TeacherSubjectLessonsPage })));
const TeacherSubjectsPage = lazyRetry(() => import("@/features/academics/TeacherSubjectsPage").then((m) => ({ default: m.TeacherSubjectsPage })));
const MySubjectsPage = lazyRetry(() => import("@/features/academics/MySubjectsPage").then((m) => ({ default: m.MySubjectsPage })));
const SubjectOfferingCAPage = lazyRetry(() => import("@/features/academics/SubjectOfferingCAPage").then((m) => ({ default: m.SubjectOfferingCAPage })));
const SubjectOfferingCommunicationsPage = lazyRetry(() => import("@/features/academics/SubjectOfferingCommunicationsPage").then((m) => ({ default: m.SubjectOfferingCommunicationsPage })));
const TeacherSubjectPrivateThreadPage = lazyRetry(() => import("@/features/academics/TeacherSubjectPrivateThreadPage").then((m) => ({ default: m.TeacherSubjectPrivateThreadPage })));
const SubjectResultsPage = lazyRetry(() => import("@/features/academics/SubjectResultsPage").then((m) => ({ default: m.SubjectResultsPage })));
const SubjectOfferingFormPage = lazyRetry(() => import("@/features/academics/SubjectOfferingFormPage").then((m) => ({ default: m.SubjectOfferingFormPage })));
const SubjectOfferingRosterPage = lazyRetry(() => import("@/features/academics/SubjectOfferingRosterPage").then((m) => ({ default: m.SubjectOfferingRosterPage })));
const SubjectOfferingsListPage = lazyRetry(() => import("@/features/academics/SubjectOfferingsListPage").then((m) => ({ default: m.SubjectOfferingsListPage })));
const TermFormPage = lazyRetry(() => import("@/features/academics/TermFormPage").then((m) => ({ default: m.TermFormPage })));
const TermsListPage = lazyRetry(() => import("@/features/academics/TermsListPage").then((m) => ({ default: m.TermsListPage })));
const MyAssignmentsPage = lazyRetry(() => import("@/features/assignments/MyAssignmentsPage").then((m) => ({ default: m.MyAssignmentsPage })));
const MyLibraryPage = lazyRetry(() => import("@/features/library/MyLibraryPage").then((m) => ({ default: m.MyLibraryPage })));
const MyHostelPage = lazyRetry(() => import("@/features/hostel/MyHostelPage").then((m) => ({ default: m.MyHostelPage })));
const GradeSubmissionFormPage = lazyRetry(() => import("@/features/assignments/GradeSubmissionFormPage").then((m) => ({ default: m.GradeSubmissionFormPage })));
const HomeworkAssignmentFormPage = lazyRetry(() => import("@/features/assignments/HomeworkAssignmentFormPage").then((m) => ({ default: m.HomeworkAssignmentFormPage })));
const HomeworkAssignmentsListPage = lazyRetry(() => import("@/features/assignments/HomeworkAssignmentsListPage").then((m) => ({ default: m.HomeworkAssignmentsListPage })));
const SubmissionsListPage = lazyRetry(() => import("@/features/assignments/SubmissionsListPage").then((m) => ({ default: m.SubmissionsListPage })));
const AttendanceIndexRedirect = lazyRetry(() => import("@/features/attendance/AttendanceIndexRedirect").then((m) => ({ default: m.AttendanceIndexRedirect })));
const AttendanceLayout = lazyRetry(() => import("@/features/attendance/AttendanceLayout").then((m) => ({ default: m.AttendanceLayout })));
const AttendanceRecordFormPage = lazyRetry(() => import("@/features/attendance/AttendanceRecordFormPage").then((m) => ({ default: m.AttendanceRecordFormPage })));
const AttendanceRecordsPage = lazyRetry(() => import("@/features/attendance/AttendanceRecordsPage").then((m) => ({ default: m.AttendanceRecordsPage })));
const MyAttendancePage = lazyRetry(() => import("@/features/attendance/MyAttendancePage").then((m) => ({ default: m.MyAttendancePage })));
const MyStaffAttendancePage = lazyRetry(() => import("@/features/attendance/MyStaffAttendancePage").then((m) => ({ default: m.MyStaffAttendancePage })));
const AttendanceStatsPage = lazyRetry(() => import("@/features/attendance/AttendanceStatsPage").then((m) => ({ default: m.AttendanceStatsPage })));
const StaffAttendanceFormPage = lazyRetry(() => import("@/features/attendance/StaffAttendanceFormPage").then((m) => ({ default: m.StaffAttendanceFormPage })));
const StaffAttendanceListPage = lazyRetry(() => import("@/features/attendance/StaffAttendanceListPage").then((m) => ({ default: m.StaffAttendanceListPage })));
const TakeAttendancePage = lazyRetry(() => import("@/features/attendance/TakeAttendancePage").then((m) => ({ default: m.TakeAttendancePage })));
const PermissionFormPage = lazyRetry(() => import("@/features/authorization/PermissionFormPage").then((m) => ({ default: m.PermissionFormPage })));
const PermissionsListPage = lazyRetry(() => import("@/features/authorization/PermissionsListPage").then((m) => ({ default: m.PermissionsListPage })));
const RoleDetailPage = lazyRetry(() => import("@/features/authorization/RoleDetailPage").then((m) => ({ default: m.RoleDetailPage })));
const RoleFormPage = lazyRetry(() => import("@/features/authorization/RoleFormPage").then((m) => ({ default: m.RoleFormPage })));
const RolesListPage = lazyRetry(() => import("@/features/authorization/RolesListPage").then((m) => ({ default: m.RolesListPage })));
const AuditLogDetailPage = lazyRetry(() => import("@/features/audit/AuditLogDetailPage").then((m) => ({ default: m.AuditLogDetailPage })));
const AuditLogsListPage = lazyRetry(() => import("@/features/audit/AuditLogsListPage").then((m) => ({ default: m.AuditLogsListPage })));
const BrandedLoginPage = lazyRetry(() => import("@/features/auth/BrandedLoginPage").then((m) => ({ default: m.BrandedLoginPage })));
const ForgotPasswordPage = lazyRetry(() => import("@/features/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const AcceptInvitationPage = lazyRetry(() => import("@/features/auth/AcceptInvitationPage").then((m) => ({ default: m.AcceptInvitationPage })));
const VerifyEmailPage = lazyRetry(() => import("@/features/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const LegacySchoolLoginRedirect = lazyRetry(() => import("@/features/auth/LegacySchoolLoginRedirect").then((m) => ({ default: m.LegacySchoolLoginRedirect })));
const FindSchoolPage = lazyRetry(() => import("@/features/auth/FindSchoolPage").then((m) => ({ default: m.FindSchoolPage })));
const EnquiriesPage = lazyRetry(() => import("@/features/enquiries/EnquiriesPage").then((m) => ({ default: m.EnquiriesPage })));
const MaintenancePage = lazyRetry(() => import("@/features/maintenance/MaintenancePage").then((m) => ({ default: m.MaintenancePage })));
const ExamTimetablePage = lazyRetry(() => import("@/features/examinations/ExamTimetablePage").then((m) => ({ default: m.ExamTimetablePage })));
const MyExamTimetablePage = lazyRetry(() => import("@/features/examinations/MyExamTimetablePage").then((m) => ({ default: m.MyExamTimetablePage })));
const GradebookPage = lazyRetry(() => import("@/features/examinations/GradebookPage").then((m) => ({ default: m.GradebookPage })));
const ClassResultsListPage = lazyRetry(() => import("@/features/examinations/ClassResultsListPage").then((m) => ({ default: m.ClassResultsListPage })));
const BackupsPage = lazyRetry(() => import("@/features/backups/BackupsPage").then((m) => ({ default: m.BackupsPage })));
const LoginPage = lazyRetry(() => import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const TwoFactorPage = lazyRetry(() => import("@/features/auth/TwoFactorPage").then((m) => ({ default: m.TwoFactorPage })));
const ResetPasswordPage = lazyRetry(() => import("@/features/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AnnouncementFormPage = lazyRetry(() => import("@/features/communications/AnnouncementFormPage").then((m) => ({ default: m.AnnouncementFormPage })));
const AnnouncementsListPage = lazyRetry(() => import("@/features/communications/AnnouncementsListPage").then((m) => ({ default: m.AnnouncementsListPage })));
const RecipientFormPage = lazyRetry(() => import("@/features/communications/RecipientFormPage").then((m) => ({ default: m.RecipientFormPage })));
const RecipientsListPage = lazyRetry(() => import("@/features/communications/RecipientsListPage").then((m) => ({ default: m.RecipientsListPage })));
const ComplaintDetailPage = lazyRetry(() => import("@/features/complaints/ComplaintDetailPage").then((m) => ({ default: m.ComplaintDetailPage })));
const ComplaintFormPage = lazyRetry(() => import("@/features/complaints/ComplaintFormPage").then((m) => ({ default: m.ComplaintFormPage })));
const ComplaintsListPage = lazyRetry(() => import("@/features/complaints/ComplaintsListPage").then((m) => ({ default: m.ComplaintsListPage })));
const DashboardPage = lazyRetry(() => import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const IncidentFormPage = lazyRetry(() => import("@/features/discipline/IncidentFormPage").then((m) => ({ default: m.IncidentFormPage })));
const IncidentsListPage = lazyRetry(() => import("@/features/discipline/IncidentsListPage").then((m) => ({ default: m.IncidentsListPage })));
const DocumentFormPage = lazyRetry(() => import("@/features/documents/DocumentFormPage").then((m) => ({ default: m.DocumentFormPage })));
const DocumentsLayout = lazyRetry(() => import("@/features/documents/DocumentsLayout").then((m) => ({ default: m.DocumentsLayout })));
const DocumentsListPage = lazyRetry(() => import("@/features/documents/DocumentsListPage").then((m) => ({ default: m.DocumentsListPage })));
const LessonDetailPage = lazyRetry(() => import("@/features/education/LessonDetailPage").then((m) => ({ default: m.LessonDetailPage })));
const LessonFormPage = lazyRetry(() => import("@/features/education/LessonFormPage").then((m) => ({ default: m.LessonFormPage })));
const LessonsListPage = lazyRetry(() => import("@/features/education/LessonsListPage").then((m) => ({ default: m.LessonsListPage })));
const MyLessonsPage = lazyRetry(() => import("@/features/education/MyLessonsPage").then((m) => ({ default: m.MyLessonsPage })));
const MyDisciplinePage = lazyRetry(() => import("@/features/discipline/MyDisciplinePage").then((m) => ({ default: m.MyDisciplinePage })));
const MyMedicalPage = lazyRetry(() => import("@/features/medical/MyMedicalPage").then((m) => ({ default: m.MyMedicalPage })));
const MyTransportPage = lazyRetry(() => import("@/features/transport/MyTransportPage").then((m) => ({ default: m.MyTransportPage })));
const BuildTimetablePage = lazyRetry(() => import("@/features/timetable/BuildTimetablePage").then((m) => ({ default: m.BuildTimetablePage })));
const MyTimetablePage = lazyRetry(() => import("@/features/timetable/MyTimetablePage").then((m) => ({ default: m.MyTimetablePage })));
const MyDocumentsPage = lazyRetry(() => import("@/features/documents/MyDocumentsPage").then((m) => ({ default: m.MyDocumentsPage })));
const EventDetailPage = lazyRetry(() => import("@/features/events/EventDetailPage").then((m) => ({ default: m.EventDetailPage })));
const EventFormPage = lazyRetry(() => import("@/features/events/EventFormPage").then((m) => ({ default: m.EventFormPage })));
const EventsListPage = lazyRetry(() => import("@/features/events/EventsListPage").then((m) => ({ default: m.EventsListPage })));
const ExamFormPage = lazyRetry(() => import("@/features/examinations/ExamFormPage").then((m) => ({ default: m.ExamFormPage })));
const ExaminationsIndexRedirect = lazyRetry(() => import("@/features/examinations/ExaminationsIndexRedirect").then((m) => ({ default: m.ExaminationsIndexRedirect })));
const ExaminationsLayout = lazyRetry(() => import("@/features/examinations/ExaminationsLayout").then((m) => ({ default: m.ExaminationsLayout })));
const ExamSchedulesListPage = lazyRetry(() => import("@/features/examinations/ExamSchedulesListPage").then((m) => ({ default: m.ExamSchedulesListPage })));
const ExamScheduleFormPage = lazyRetry(() => import("@/features/examinations/ExamScheduleFormPage").then((m) => ({ default: m.ExamScheduleFormPage })));
const ExamsListPage = lazyRetry(() => import("@/features/examinations/ExamsListPage").then((m) => ({ default: m.ExamsListPage })));
const GradeBoundariesListPage = lazyRetry(() => import("@/features/examinations/GradeBoundariesListPage").then((m) => ({ default: m.GradeBoundariesListPage })));
const GradeBoundaryFormPage = lazyRetry(() => import("@/features/examinations/GradeBoundaryFormPage").then((m) => ({ default: m.GradeBoundaryFormPage })));
const GradingScaleFormPage = lazyRetry(() => import("@/features/examinations/GradingScaleFormPage").then((m) => ({ default: m.GradingScaleFormPage })));
const GradingScalesListPage = lazyRetry(() => import("@/features/examinations/GradingScalesListPage").then((m) => ({ default: m.GradingScalesListPage })));
const TranscriptPage = lazyRetry(() => import("@/features/examinations/TranscriptPage").then((m) => ({ default: m.TranscriptPage })));
const FeeCategoriesListPage = lazyRetry(() => import("@/features/finance/FeeCategoriesListPage").then((m) => ({ default: m.FeeCategoriesListPage })));
const FeeCategoryFormPage = lazyRetry(() => import("@/features/finance/FeeCategoryFormPage").then((m) => ({ default: m.FeeCategoryFormPage })));
const FeeStructureFormPage = lazyRetry(() => import("@/features/finance/FeeStructureFormPage").then((m) => ({ default: m.FeeStructureFormPage })));
const FeeStructureItemFormPage = lazyRetry(() => import("@/features/finance/FeeStructureItemFormPage").then((m) => ({ default: m.FeeStructureItemFormPage })));
const FeeStructureItemsListPage = lazyRetry(() => import("@/features/finance/FeeStructureItemsListPage").then((m) => ({ default: m.FeeStructureItemsListPage })));
const FeeStructuresListPage = lazyRetry(() => import("@/features/finance/FeeStructuresListPage").then((m) => ({ default: m.FeeStructuresListPage })));
const FinanceIndexRedirect = lazyRetry(() => import("@/features/finance/FinanceIndexRedirect").then((m) => ({ default: m.FinanceIndexRedirect })));
const FinanceLayout = lazyRetry(() => import("@/features/finance/FinanceLayout").then((m) => ({ default: m.FinanceLayout })));
const FinanceStatsPage = lazyRetry(() => import("@/features/finance/FinanceStatsPage").then((m) => ({ default: m.FinanceStatsPage })));
const GenerateInvoicesPage = lazyRetry(() => import("@/features/finance/GenerateInvoicesPage").then((m) => ({ default: m.GenerateInvoicesPage })));
const InvoiceDetailPage = lazyRetry(() => import("@/features/finance/InvoiceDetailPage").then((m) => ({ default: m.InvoiceDetailPage })));
const InvoiceFormPage = lazyRetry(() => import("@/features/finance/InvoiceFormPage").then((m) => ({ default: m.InvoiceFormPage })));
const InvoiceLineItemFormPage = lazyRetry(() => import("@/features/finance/InvoiceLineItemFormPage").then((m) => ({ default: m.InvoiceLineItemFormPage })));
const InvoiceLineItemsListPage = lazyRetry(() => import("@/features/finance/InvoiceLineItemsListPage").then((m) => ({ default: m.InvoiceLineItemsListPage })));
const InvoicesListPage = lazyRetry(() => import("@/features/finance/InvoicesListPage").then((m) => ({ default: m.InvoicesListPage })));
const PaymentFormPage = lazyRetry(() => import("@/features/finance/PaymentFormPage").then((m) => ({ default: m.PaymentFormPage })));
const PaymentReceiptPage = lazyRetry(() => import("@/features/finance/PaymentReceiptPage").then((m) => ({ default: m.PaymentReceiptPage })));
const PaymentsListPage = lazyRetry(() => import("@/features/finance/PaymentsListPage").then((m) => ({ default: m.PaymentsListPage })));
const RefundFormPage = lazyRetry(() => import("@/features/finance/RefundFormPage").then((m) => ({ default: m.RefundFormPage })));
const GenerateSalaryPaymentsPage = lazyRetry(() => import("@/features/salary/GenerateSalaryPaymentsPage").then((m) => ({ default: m.GenerateSalaryPaymentsPage })));
const PaySalaryPaymentPage = lazyRetry(() => import("@/features/salary/PaySalaryPaymentPage").then((m) => ({ default: m.PaySalaryPaymentPage })));
const SalaryIndexRedirect = lazyRetry(() => import("@/features/salary/SalaryIndexRedirect").then((m) => ({ default: m.SalaryIndexRedirect })));
const SalaryLayout = lazyRetry(() => import("@/features/salary/SalaryLayout").then((m) => ({ default: m.SalaryLayout })));
const SalaryPaymentReceiptPage = lazyRetry(() => import("@/features/salary/SalaryPaymentReceiptPage").then((m) => ({ default: m.SalaryPaymentReceiptPage })));
const SalaryPaymentsListPage = lazyRetry(() => import("@/features/salary/SalaryPaymentsListPage").then((m) => ({ default: m.SalaryPaymentsListPage })));
const SalaryStructureFormPage = lazyRetry(() => import("@/features/salary/SalaryStructureFormPage").then((m) => ({ default: m.SalaryStructureFormPage })));
const SalaryStructureItemFormPage = lazyRetry(() => import("@/features/salary/SalaryStructureItemFormPage").then((m) => ({ default: m.SalaryStructureItemFormPage })));
const SalaryStructureItemsListPage = lazyRetry(() => import("@/features/salary/SalaryStructureItemsListPage").then((m) => ({ default: m.SalaryStructureItemsListPage })));
const SalaryStructuresListPage = lazyRetry(() => import("@/features/salary/SalaryStructuresListPage").then((m) => ({ default: m.SalaryStructuresListPage })));
const StaffSalaryAssignmentFormPage = lazyRetry(() => import("@/features/salary/StaffSalaryAssignmentFormPage").then((m) => ({ default: m.StaffSalaryAssignmentFormPage })));
const StaffSalaryAssignmentsListPage = lazyRetry(() => import("@/features/salary/StaffSalaryAssignmentsListPage").then((m) => ({ default: m.StaffSalaryAssignmentsListPage })));
const AllocationFormPage = lazyRetry(() => import("@/features/hostel/AllocationFormPage").then((m) => ({ default: m.AllocationFormPage })));
const AllocationsListPage = lazyRetry(() => import("@/features/hostel/AllocationsListPage").then((m) => ({ default: m.AllocationsListPage })));
const BedFormPage = lazyRetry(() => import("@/features/hostel/BedFormPage").then((m) => ({ default: m.BedFormPage })));
const BedsListPage = lazyRetry(() => import("@/features/hostel/BedsListPage").then((m) => ({ default: m.BedsListPage })));
const HostelFormPage = lazyRetry(() => import("@/features/hostel/HostelFormPage").then((m) => ({ default: m.HostelFormPage })));
const HostelLayout = lazyRetry(() => import("@/features/hostel/HostelLayout").then((m) => ({ default: m.HostelLayout })));
const HostelRoomFormPage = lazyRetry(() => import("@/features/hostel/HostelRoomFormPage").then((m) => ({ default: m.HostelRoomFormPage })));
const HostelRoomsListPage = lazyRetry(() => import("@/features/hostel/HostelRoomsListPage").then((m) => ({ default: m.HostelRoomsListPage })));
const HostelsListPage = lazyRetry(() => import("@/features/hostel/HostelsListPage").then((m) => ({ default: m.HostelsListPage })));
const InventoryLayout = lazyRetry(() => import("@/features/inventory/InventoryLayout").then((m) => ({ default: m.InventoryLayout })));
const StockAdjustmentFormPage = lazyRetry(() => import("@/features/inventory/StockAdjustmentFormPage").then((m) => ({ default: m.StockAdjustmentFormPage })));
const BookCopiesListPage = lazyRetry(() => import("@/features/library/BookCopiesListPage").then((m) => ({ default: m.BookCopiesListPage })));
const BookCopyFormPage = lazyRetry(() => import("@/features/library/BookCopyFormPage").then((m) => ({ default: m.BookCopyFormPage })));
const BookFormPage = lazyRetry(() => import("@/features/library/BookFormPage").then((m) => ({ default: m.BookFormPage })));
const BooksListPage = lazyRetry(() => import("@/features/library/BooksListPage").then((m) => ({ default: m.BooksListPage })));
const CategoriesListPage = lazyRetry(() => import("@/features/library/CategoriesListPage").then((m) => ({ default: m.CategoriesListPage })));
const CategoryFormPage = lazyRetry(() => import("@/features/library/CategoryFormPage").then((m) => ({ default: m.CategoryFormPage })));
const CheckoutPage = lazyRetry(() => import("@/features/library/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));
const LibraryLayout = lazyRetry(() => import("@/features/library/LibraryLayout").then((m) => ({ default: m.LibraryLayout })));
const LoansListPage = lazyRetry(() => import("@/features/library/LoansListPage").then((m) => ({ default: m.LoansListPage })));
const ReservationFormPage = lazyRetry(() => import("@/features/library/ReservationFormPage").then((m) => ({ default: m.ReservationFormPage })));
const ReservationsListPage = lazyRetry(() => import("@/features/library/ReservationsListPage").then((m) => ({ default: m.ReservationsListPage })));
const LiveSessionFormPage = lazyRetry(() => import("@/features/live-sessions/LiveSessionFormPage").then((m) => ({ default: m.LiveSessionFormPage })));
const LiveSessionRoomPage = lazyRetry(() => import("@/features/live-sessions/LiveSessionRoomPage").then((m) => ({ default: m.LiveSessionRoomPage })));
const LiveSessionsListPage = lazyRetry(() => import("@/features/live-sessions/LiveSessionsListPage").then((m) => ({ default: m.LiveSessionsListPage })));
const MyLiveSessionsPage = lazyRetry(() => import("@/features/live-sessions/MyLiveSessionsPage").then((m) => ({ default: m.MyLiveSessionsPage })));
const IdCardsPage = lazyRetry(() => import("@/features/idcards/IdCardsPage").then((m) => ({ default: m.IdCardsPage })));
const MyIdCardPage = lazyRetry(() => import("@/features/idcards/MyIdCardPage").then((m) => ({ default: m.MyIdCardPage })));
const NotificationDetailPage = lazyRetry(() => import("@/features/notifications/NotificationDetailPage").then((m) => ({ default: m.NotificationDetailPage })));
const MeetingDetailPage = lazyRetry(() => import("@/features/meetings/MeetingDetailPage").then((m) => ({ default: m.MeetingDetailPage })));
const MeetingFormPage = lazyRetry(() => import("@/features/meetings/MeetingFormPage").then((m) => ({ default: m.MeetingFormPage })));
const MeetingRoomPage = lazyRetry(() => import("@/features/meetings/MeetingRoomPage").then((m) => ({ default: m.MeetingRoomPage })));
const MeetingsListPage = lazyRetry(() => import("@/features/meetings/MeetingsListPage").then((m) => ({ default: m.MeetingsListPage })));
const MyMeetingsPage = lazyRetry(() => import("@/features/meetings/MyMeetingsPage").then((m) => ({ default: m.MyMeetingsPage })));
const PublicVerifyCardPage = lazyRetry(() => import("@/features/idcards/PublicVerifyCardPage").then((m) => ({ default: m.PublicVerifyCardPage })));
const MyQuizzesPage = lazyRetry(() => import("@/features/quizzes/MyQuizzesPage").then((m) => ({ default: m.MyQuizzesPage })));
const QuizResultsPage = lazyRetry(() => import("@/features/quizzes/QuizResultsPage").then((m) => ({ default: m.QuizResultsPage })));
const SubjectOfferingQuizzesPage = lazyRetry(() => import("@/features/quizzes/SubjectOfferingQuizzesPage").then((m) => ({ default: m.SubjectOfferingQuizzesPage })));
const TakeQuizPage = lazyRetry(() => import("@/features/quizzes/TakeQuizPage").then((m) => ({ default: m.TakeQuizPage })));
const MedicalLayout = lazyRetry(() => import("@/features/medical/MedicalLayout").then((m) => ({ default: m.MedicalLayout })));
const ProfileFormPage = lazyRetry(() => import("@/features/medical/ProfileFormPage").then((m) => ({ default: m.ProfileFormPage })));
const ProfilesListPage = lazyRetry(() => import("@/features/medical/ProfilesListPage").then((m) => ({ default: m.ProfilesListPage })));
const VisitFormPage = lazyRetry(() => import("@/features/medical/VisitFormPage").then((m) => ({ default: m.VisitFormPage })));
const VisitsListPage = lazyRetry(() => import("@/features/medical/VisitsListPage").then((m) => ({ default: m.VisitsListPage })));
const NotificationsListPage = lazyRetry(() => import("@/features/notifications/NotificationsListPage").then((m) => ({ default: m.NotificationsListPage })));
const GuardianFormPage = lazyRetry(() => import("@/features/parents/GuardianFormPage").then((m) => ({ default: m.GuardianFormPage })));
const GuardiansListPage = lazyRetry(() => import("@/features/parents/GuardiansListPage").then((m) => ({ default: m.GuardiansListPage })));
const InvitePlatformAdminFormPage = lazyRetry(() => import("@/features/platform/InvitePlatformAdminFormPage").then((m) => ({ default: m.InvitePlatformAdminFormPage })));
const PlatformAdminsListPage = lazyRetry(() => import("@/features/platform/PlatformAdminsListPage").then((m) => ({ default: m.PlatformAdminsListPage })));
const PlatformOverviewPage = lazyRetry(() => import("@/features/platform/PlatformOverviewPage").then((m) => ({ default: m.PlatformOverviewPage })));
const ProcurementLayout = lazyRetry(() => import("@/features/procurement/ProcurementLayout").then((m) => ({ default: m.ProcurementLayout })));
const RecordDetailPage = lazyRetry(() => import("@/features/records/RecordDetailPage").then((m) => ({ default: m.RecordDetailPage })));
const RecordFormPage = lazyRetry(() => import("@/features/records/RecordFormPage").then((m) => ({ default: m.RecordFormPage })));
const RecordsListPage = lazyRetry(() => import("@/features/records/RecordsListPage").then((m) => ({ default: m.RecordsListPage })));
const PurchaseOrderDetailPage = lazyRetry(() => import("@/features/procurement/PurchaseOrderDetailPage").then((m) => ({ default: m.PurchaseOrderDetailPage })));
const PurchaseOrderFormPage = lazyRetry(() => import("@/features/procurement/PurchaseOrderFormPage").then((m) => ({ default: m.PurchaseOrderFormPage })));
const PurchaseOrderItemFormPage = lazyRetry(() => import("@/features/procurement/PurchaseOrderItemFormPage").then((m) => ({ default: m.PurchaseOrderItemFormPage })));
const PurchaseOrderItemsListPage = lazyRetry(() => import("@/features/procurement/PurchaseOrderItemsListPage").then((m) => ({ default: m.PurchaseOrderItemsListPage })));
const PurchaseOrderReceiptPage = lazyRetry(() => import("@/features/procurement/PurchaseOrderReceiptPage").then((m) => ({ default: m.PurchaseOrderReceiptPage })));
const PurchaseOrdersListPage = lazyRetry(() => import("@/features/procurement/PurchaseOrdersListPage").then((m) => ({ default: m.PurchaseOrdersListPage })));
const PurchaseRequestDetailPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestDetailPage").then((m) => ({ default: m.PurchaseRequestDetailPage })));
const PurchaseRequestFormPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestFormPage").then((m) => ({ default: m.PurchaseRequestFormPage })));
const PurchaseRequestItemFormPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestItemFormPage").then((m) => ({ default: m.PurchaseRequestItemFormPage })));
const PurchaseRequestItemsListPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestItemsListPage").then((m) => ({ default: m.PurchaseRequestItemsListPage })));
const PurchaseRequestRejectFormPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestRejectFormPage").then((m) => ({ default: m.PurchaseRequestRejectFormPage })));
const PurchaseRequestsListPage = lazyRetry(() => import("@/features/procurement/PurchaseRequestsListPage").then((m) => ({ default: m.PurchaseRequestsListPage })));
const AcademicPerformanceReportPage = lazyRetry(() => import("@/features/reports/AcademicPerformanceReportPage").then((m) => ({ default: m.AcademicPerformanceReportPage })));
const AttendanceReportPage = lazyRetry(() => import("@/features/reports/AttendanceReportPage").then((m) => ({ default: m.AttendanceReportPage })));
const EnrollmentReportPage = lazyRetry(() => import("@/features/reports/EnrollmentReportPage").then((m) => ({ default: m.EnrollmentReportPage })));
const FinanceReportPage = lazyRetry(() => import("@/features/reports/FinanceReportPage").then((m) => ({ default: m.FinanceReportPage })));
const ReportsLayout = lazyRetry(() => import("@/features/reports/ReportsLayout").then((m) => ({ default: m.ReportsLayout })));
const ReceiveOrderFormPage = lazyRetry(() => import("@/features/procurement/ReceiveOrderFormPage").then((m) => ({ default: m.ReceiveOrderFormPage })));
const SupplierFormPage = lazyRetry(() => import("@/features/procurement/SupplierFormPage").then((m) => ({ default: m.SupplierFormPage })));
const SuppliersListPage = lazyRetry(() => import("@/features/procurement/SuppliersListPage").then((m) => ({ default: m.SuppliersListPage })));
const SchoolDetailPage = lazyRetry(() => import("@/features/schools/SchoolDetailPage").then((m) => ({ default: m.SchoolDetailPage })));
const SchoolFormPage = lazyRetry(() => import("@/features/schools/SchoolFormPage").then((m) => ({ default: m.SchoolFormPage })));
const SchoolSuspendFormPage = lazyRetry(() => import("@/features/schools/SchoolSuspendFormPage").then((m) => ({ default: m.SchoolSuspendFormPage })));
const SchoolDeletePage = lazyRetry(() => import("@/features/schools/SchoolDeletePage").then((m) => ({ default: m.SchoolDeletePage })));
const SchoolsListPage = lazyRetry(() => import("@/features/schools/SchoolsListPage").then((m) => ({ default: m.SchoolsListPage })));
const SettingsPage = lazyRetry(() => import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const StaffDetailPage = lazyRetry(() => import("@/features/staff/StaffDetailPage").then((m) => ({ default: m.StaffDetailPage })));
const StaffEditPage = lazyRetry(() => import("@/features/staff/StaffEditPage").then((m) => ({ default: m.StaffEditPage })));
const StaffFormPage = lazyRetry(() => import("@/features/staff/StaffFormPage").then((m) => ({ default: m.StaffFormPage })));
const StaffListPage = lazyRetry(() => import("@/features/staff/StaffListPage").then((m) => ({ default: m.StaffListPage })));
const StudentDetailPage = lazyRetry(() => import("@/features/students/StudentDetailPage").then((m) => ({ default: m.StudentDetailPage })));
const StudentFormPage = lazyRetry(() => import("@/features/students/StudentFormPage").then((m) => ({ default: m.StudentFormPage })));
const StudentsListPage = lazyRetry(() => import("@/features/students/StudentsListPage").then((m) => ({ default: m.StudentsListPage })));
const PeriodFormPage = lazyRetry(() => import("@/features/timetable/PeriodFormPage").then((m) => ({ default: m.PeriodFormPage })));
const PeriodsListPage = lazyRetry(() => import("@/features/timetable/PeriodsListPage").then((m) => ({ default: m.PeriodsListPage })));
const RoomFormPage = lazyRetry(() => import("@/features/timetable/RoomFormPage").then((m) => ({ default: m.RoomFormPage })));
const RoomsListPage = lazyRetry(() => import("@/features/timetable/RoomsListPage").then((m) => ({ default: m.RoomsListPage })));
const TimetableEntryFormPage = lazyRetry(() => import("@/features/timetable/TimetableEntryFormPage").then((m) => ({ default: m.TimetableEntryFormPage })));
const TimetableGridPage = lazyRetry(() => import("@/features/timetable/TimetableGridPage").then((m) => ({ default: m.TimetableGridPage })));
const TimetableLayout = lazyRetry(() => import("@/features/timetable/TimetableLayout").then((m) => ({ default: m.TimetableLayout })));
const AssignmentFormPage = lazyRetry(() => import("@/features/transport/AssignmentFormPage").then((m) => ({ default: m.AssignmentFormPage })));
const AssignmentsListPage = lazyRetry(() => import("@/features/transport/AssignmentsListPage").then((m) => ({ default: m.AssignmentsListPage })));
const RouteFormPage = lazyRetry(() => import("@/features/transport/RouteFormPage").then((m) => ({ default: m.RouteFormPage })));
const RoutesListPage = lazyRetry(() => import("@/features/transport/RoutesListPage").then((m) => ({ default: m.RoutesListPage })));
const StopFormPage = lazyRetry(() => import("@/features/transport/StopFormPage").then((m) => ({ default: m.StopFormPage })));
const StopsListPage = lazyRetry(() => import("@/features/transport/StopsListPage").then((m) => ({ default: m.StopsListPage })));
const TransportLayout = lazyRetry(() => import("@/features/transport/TransportLayout").then((m) => ({ default: m.TransportLayout })));
const VehicleFormPage = lazyRetry(() => import("@/features/transport/VehicleFormPage").then((m) => ({ default: m.VehicleFormPage })));
const VehicleMaintenanceFormPage = lazyRetry(() => import("@/features/transport/VehicleMaintenanceFormPage").then((m) => ({ default: m.VehicleMaintenanceFormPage })));
const VehicleMaintenanceListPage = lazyRetry(() => import("@/features/transport/VehicleMaintenanceListPage").then((m) => ({ default: m.VehicleMaintenanceListPage })));
const VehiclesListPage = lazyRetry(() => import("@/features/transport/VehiclesListPage").then((m) => ({ default: m.VehiclesListPage })));
const ForcedPasswordChangePage = lazyRetry(() => import("@/features/auth/ForcedPasswordChangePage").then((m) => ({ default: m.ForcedPasswordChangePage })));

export function AppRoutes() {
  // Inside a school's address (/greenwood/...) the router is mounted at that slug: its own login and
  // application forms exist, and the platform / generic pages do not. Outside, the opposite.
  const slug = useSchoolSlug();
  return (
    <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={slug ? <BrandedLoginPage /> : <LoginPage />} />
        {!slug && <Route path="/login/:slug" element={<LegacySchoolLoginRedirect />} />}
        {!slug && <Route path="/find-school" element={<FindSchoolPage />} />}
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/two-factor" element={<TwoFactorPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {slug ? (
          <>
            <Route path="/apply" element={<PublicApplyPage />} />
            <Route path="/apply/:kind" element={<PublicApplyPage />} />
          </>
        ) : (
          <>
            {/* Application links shared before schools had their own address: /apply/<slug>/<kind> */}
            <Route path="/apply/:schoolSlug" element={<PublicApplyPage />} />
            <Route path="/apply/:schoolSlug/:kind" element={<PublicApplyPage />} />
          </>
        )}
        <Route path="/verify-card/:token" element={<PublicVerifyCardPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/my-quizzes/:quizId/take" element={<TakeQuizPage />} />

        <Route element={<AuthLayout />}>
          <Route path="/change-password" element={<ForcedPasswordChangePage />} />
        </Route>

        <Route element={<AccountLayout />}>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsListPage />} />
        </Route>

        <Route element={<PlatformShell />}>
          <Route path="/platform" element={<Navigate to="/platform/overview" replace />} />
          <Route path="/platform/overview" element={<PlatformOverviewPage />} />
          <Route path="/platform/schools" element={<SchoolsListPage />} />
          <Route path="/platform/schools/new" element={<SchoolFormPage />} />
          <Route path="/platform/schools/:id" element={<SchoolDetailPage />} />
          <Route path="/platform/schools/:id/edit" element={<FormModal list={<SchoolsListPage />} large><SchoolFormPage /></FormModal>} />
          <Route path="/platform/schools/:id/suspend" element={<SchoolSuspendFormPage />} />
          <Route path="/platform/schools/:id/delete" element={<SchoolDeletePage />} />
          <Route path="/platform/enquiries" element={<EnquiriesPage />} />
          <Route path="/platform/maintenance" element={<MaintenancePage />} />
          <Route path="/platform/backups" element={<BackupsPage />} />
          <Route path="/platform/admins" element={<PlatformAdminsListPage />} />
          <Route path="/platform/admins/new" element={<InvitePlatformAdminFormPage />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsListPage />} />
          <Route path="/students/new" element={<StudentFormPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/students/:id/edit" element={<FormModal list={<StudentsListPage />} large><StudentFormPage /></FormModal>} />

          <Route path="/staff" element={<StaffListPage />} />
          <Route path="/staff/new" element={<StaffFormPage />} />
          <Route path="/staff/:id" element={<FormModal detail large list={<StaffListPage />}><StaffDetailPage /></FormModal>} />
          <Route path="/staff/:id/edit" element={<FormModal list={<StaffListPage />} large><StaffEditPage /></FormModal>} />

          <Route path="/discipline" element={<IncidentsListPage />} />
          <Route path="/discipline/new" element={<FormModal list={<IncidentsListPage />} large><IncidentFormPage /></FormModal>} />
          <Route path="/discipline/:id/edit" element={<FormModal list={<IncidentsListPage />} large><IncidentFormPage /></FormModal>} />

          <Route path="/parents" element={<GuardiansListPage />} />
          <Route path="/parents/new" element={<FormModal list={<GuardiansListPage />} large><GuardianFormPage /></FormModal>} />
          <Route path="/parents/:id/edit" element={<FormModal list={<GuardiansListPage />} large><GuardianFormPage /></FormModal>} />

          <Route path="/audit" element={<AuditLogsListPage />} />
          <Route path="/audit/:id" element={<FormModal detail large list={<AuditLogsListPage />}><AuditLogDetailPage /></FormModal>} />
          <Route path="/notifications/:id" element={<FormModal detail large list={<NotificationsListPage />}><NotificationDetailPage /></FormModal>} />
          <Route path="/meetings" element={<MeetingsListPage />} />
          <Route path="/meetings/new" element={<MeetingFormPage />} />
          <Route path="/meetings/:id" element={<FormModal detail large list={<MeetingsListPage />}><MeetingDetailPage /></FormModal>} />
          <Route path="/meetings/:id/room" element={<MeetingRoomPage />} />
          <Route path="/my-meetings" element={<MyMeetingsPage />} />
          <Route path="/idcards" element={<IdCardsPage />} />
          <Route path="/my-id-card" element={<MyIdCardPage />} />
          <Route path="/admissions/applications" element={<ApplicationsListPage />} />
          <Route path="/admissions/applications/:id" element={<ApplicationDetailPage />} />
          <Route path="/admissions/form" element={<ApplicationFormBuilderPage />} />
          <Route path="/roles" element={<RolesListPage />} />
          <Route path="/roles/new" element={<FormModal list={<RolesListPage />}><RoleFormPage /></FormModal>} />
          <Route path="/roles/:id" element={<RoleDetailPage />} />
          <Route path="/permissions" element={<PermissionsListPage />} />
          <Route path="/permissions/new" element={<FormModal list={<PermissionsListPage />}><PermissionFormPage /></FormModal>} />

          <Route path="/reports" element={<ReportsLayout />}>
            <Route index element={<Navigate to="enrollment" replace />} />
            <Route path="enrollment" element={<EnrollmentReportPage />} />
            <Route path="attendance" element={<AttendanceReportPage />} />
            <Route path="academic-performance" element={<AcademicPerformanceReportPage />} />
            <Route path="finance" element={<FinanceReportPage />} />
          </Route>

          <Route path="/communications" element={<AnnouncementsListPage />} />
          <Route path="/communications/new" element={<AnnouncementFormPage />} />
          <Route path="/communications/:id/edit" element={<FormModal list={<AnnouncementsListPage />} large><AnnouncementFormPage /></FormModal>} />
          <Route path="/communications/:announcementId/recipients" element={<RecipientsListPage />} />
          <Route path="/communications/:announcementId/recipients/new" element={<FormModal list={<RecipientsListPage />}><RecipientFormPage /></FormModal>} />

          <Route path="/my-assignments" element={<MyAssignmentsPage />} />
          <Route path="/my-library" element={<MyLibraryPage />} />
          <Route path="/my-hostel" element={<MyHostelPage />} />
          <Route path="/assignments" element={<HomeworkAssignmentsListPage />} />
          <Route path="/assignments/new" element={<HomeworkAssignmentFormPage />} />
          <Route path="/assignments/:id/edit" element={<FormModal list={<HomeworkAssignmentsListPage />} large><HomeworkAssignmentFormPage /></FormModal>} />
          <Route path="/assignments/:assignmentId/submissions" element={<SubmissionsListPage />} />
          <Route
            path="/assignments/:assignmentId/submissions/:id/grade"
            element={<GradeSubmissionFormPage />}
          />

          <Route path="/documents" element={<DocumentsLayout />}>
            <Route index element={<Navigate to="files" replace />} />
            <Route path="files" element={<DocumentsListPage />} />
            <Route path="files/new" element={<FormModal list={<DocumentsListPage />} large><DocumentFormPage /></FormModal>} />
            <Route path="files/:id/edit" element={<FormModal list={<DocumentsListPage />} large><DocumentFormPage /></FormModal>} />
            <Route path="categories" element={<DocumentCategoriesListPage />} />
            <Route path="categories/new" element={<FormModal list={<DocumentCategoriesListPage />}><DocumentCategoryFormPage /></FormModal>} />
            <Route path="categories/:id/edit" element={<FormModal list={<DocumentCategoriesListPage />}><DocumentCategoryFormPage /></FormModal>} />
          </Route>

          <Route path="/events" element={<EventsListPage />} />
          <Route path="/events/new" element={<EventFormPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events/:id/edit" element={<FormModal list={<EventsListPage />} large><EventFormPage /></FormModal>} />

          <Route path="/complaints" element={<ComplaintsListPage />} />
          <Route path="/complaints/new" element={<ComplaintFormPage />} />
          <Route path="/complaints/:id" element={<ComplaintDetailPage />} />

          <Route path="/records" element={<RecordsListPage />} />
          <Route path="/records/new" element={<RecordFormPage />} />
          <Route path="/records/:id" element={<FormModal detail large list={<RecordsListPage />}><RecordDetailPage /></FormModal>} />
          <Route path="/records/:id/edit" element={<FormModal list={<RecordsListPage />} large><RecordFormPage /></FormModal>} />

          <Route path="/transcript" element={<TranscriptPage />} />
          <Route path="/my-discipline" element={<MyDisciplinePage />} />
          <Route path="/my-medical" element={<MyMedicalPage />} />
          <Route path="/my-transport" element={<MyTransportPage />} />
          <Route path="/my-timetable" element={<MyTimetablePage />} />
          <Route path="/my-exam-timetable" element={<MyExamTimetablePage />} />
          <Route path="/my-documents" element={<MyDocumentsPage />} />
          <Route path="/subjects" element={<TeacherSubjectsPage />} />
          <Route path="/subjects/:id/lessons" element={<TeacherSubjectLessonsPage />} />
          <Route path="/my-subjects" element={<MySubjectsPage />} />
          <Route path="/my-subjects/:id/ca" element={<MySubjectCAPage />} />
          <Route path="/my-subjects/:id/ca/:assessmentId" element={<MyAssessmentDetailPage />} />
          <Route path="/my-subjects/:id/lessons" element={<MySubjectLessonsPage />} />
          <Route path="/my-subjects/:id/communications" element={<MySubjectCommunicationsPage />} />
          <Route path="/my-results" element={<MyResultsPage />} />
          <Route path="/my-results/:schoolClassId/:termId" element={<MyResultDetailPage />} />
          <Route path="/my-graduation-status" element={<MyGraduationStatusPage />} />
          <Route path="/my-attendance" element={<MyAttendancePage />} />
          <Route path="/my-staff-attendance" element={<MyStaffAttendancePage />} />

          <Route path="/education/lessons" element={<LessonsListPage />} />
          <Route path="/education/lessons/new" element={<LessonFormPage />} />
          <Route path="/education/lessons/:id" element={<LessonDetailPage />} />
          <Route path="/education/lessons/:id/edit" element={<FormModal list={<LessonsListPage />} large><LessonFormPage /></FormModal>} />
          <Route path="/my-lessons" element={<MyLessonsPage />} />

          <Route path="/live-sessions" element={<LiveSessionsListPage />} />
          <Route path="/live-sessions/new" element={<LiveSessionFormPage />} />
          <Route path="/live-sessions/:id/room" element={<LiveSessionRoomPage />} />
          <Route path="/my-live-sessions" element={<MyLiveSessionsPage />} />

          <Route path="/my-quizzes" element={<MyQuizzesPage />} />
          <Route path="/quizzes/:quizId/results" element={<QuizResultsPage />} />

          <Route path="/inventory" element={<InventoryLayout />}>
            <Route index element={<Navigate to="items" replace />} />
            <Route path="items" element={<InventoryItemsListPage />} />
            <Route path="items/new" element={<FormModal list={<InventoryItemsListPage />}><InventoryItemFormPage /></FormModal>} />
            <Route path="items/:id/edit" element={<FormModal list={<InventoryItemsListPage />}><InventoryItemFormPage /></FormModal>} />
            <Route path="items/:id/stock-in" element={<StockAdjustmentFormPage />} />
            <Route path="items/:id/stock-out" element={<StockAdjustmentFormPage />} />
            <Route path="categories" element={<InventoryCategoriesListPage />} />
            <Route path="categories/new" element={<FormModal list={<InventoryCategoriesListPage />}><InventoryCategoryFormPage /></FormModal>} />
            <Route path="categories/:id/edit" element={<FormModal list={<InventoryCategoriesListPage />}><InventoryCategoryFormPage /></FormModal>} />
            <Route path="transactions" element={<InventoryTransactionsListPage />} />
          </Route>

          <Route path="/procurement" element={<ProcurementLayout />}>
            <Route index element={<Navigate to="requests" replace />} />
            <Route path="requests" element={<PurchaseRequestsListPage />} />
            <Route path="requests/new" element={<PurchaseRequestFormPage />} />
            <Route path="requests/:id" element={<PurchaseRequestDetailPage />} />
            <Route path="requests/:id/edit" element={<FormModal list={<PurchaseRequestsListPage />} large><PurchaseRequestFormPage /></FormModal>} />
            <Route path="requests/:id/reject" element={<PurchaseRequestRejectFormPage />} />
            <Route path="requests/:id/items" element={<PurchaseRequestItemsListPage />} />
            <Route path="requests/:id/items/new" element={<FormModal list={<PurchaseRequestItemsListPage />}><PurchaseRequestItemFormPage /></FormModal>} />
            <Route path="requests/:id/items/:itemId/edit" element={<FormModal list={<PurchaseRequestItemsListPage />}><PurchaseRequestItemFormPage /></FormModal>} />
            <Route path="orders" element={<PurchaseOrdersListPage />} />
            <Route path="orders/new" element={<PurchaseOrderFormPage />} />
            <Route path="orders/:id" element={<PurchaseOrderDetailPage />} />
            <Route path="orders/:id/edit" element={<FormModal list={<PurchaseOrdersListPage />} large><PurchaseOrderFormPage /></FormModal>} />
            <Route path="orders/:id/receive" element={<ReceiveOrderFormPage />} />
            <Route path="orders/:id/receipt" element={<PurchaseOrderReceiptPage />} />
            <Route path="orders/:id/items" element={<PurchaseOrderItemsListPage />} />
            <Route path="orders/:id/items/new" element={<FormModal list={<PurchaseOrderItemsListPage />}><PurchaseOrderItemFormPage /></FormModal>} />
            <Route path="orders/:id/items/:itemId/edit" element={<FormModal list={<PurchaseOrderItemsListPage />}><PurchaseOrderItemFormPage /></FormModal>} />
            <Route path="suppliers" element={<SuppliersListPage />} />
            <Route path="suppliers/new" element={<FormModal list={<SuppliersListPage />}><SupplierFormPage /></FormModal>} />
            <Route path="suppliers/:id/edit" element={<FormModal list={<SuppliersListPage />}><SupplierFormPage /></FormModal>} />
          </Route>

          <Route path="/academics" element={<AcademicsLayout />}>
            <Route index element={<Navigate to="years" replace />} />
            <Route path="years" element={<AcademicYearsListPage />} />
            <Route path="years/rollover" element={<YearRolloverPage />} />
            <Route path="years/new" element={<FormModal list={<AcademicYearsListPage />}><AcademicYearFormPage /></FormModal>} />
            <Route path="years/:id/edit" element={<FormModal list={<AcademicYearsListPage />}><AcademicYearFormPage /></FormModal>} />
            <Route path="terms" element={<TermsListPage />} />
            <Route path="terms/new" element={<FormModal list={<TermsListPage />}><TermFormPage /></FormModal>} />
            <Route path="terms/:id/edit" element={<FormModal list={<TermsListPage />}><TermFormPage /></FormModal>} />
            <Route path="departments" element={<DepartmentsListPage />} />
            <Route path="departments/new" element={<FormModal list={<DepartmentsListPage />}><DepartmentFormPage /></FormModal>} />
            <Route path="departments/:id/edit" element={<FormModal list={<DepartmentsListPage />}><DepartmentFormPage /></FormModal>} />
            <Route path="subjects" element={<SubjectsListPage />} />
            <Route path="subjects/new" element={<FormModal list={<SubjectsListPage />}><SubjectFormPage /></FormModal>} />
            <Route path="subjects/:id/edit" element={<FormModal list={<SubjectsListPage />}><SubjectFormPage /></FormModal>} />
            <Route path="subject-offerings" element={<SubjectOfferingsListPage />} />
            <Route path="subject-offerings/new" element={<FormModal list={<SubjectOfferingsListPage />} large><SubjectOfferingFormPage /></FormModal>} />
            <Route path="subject-offerings/:id/edit" element={<FormModal list={<SubjectOfferingsListPage />} large><SubjectOfferingFormPage /></FormModal>} />
            <Route path="subject-offerings/:id/students" element={<SubjectOfferingRosterPage />} />
            <Route
              path="subject-offerings/:id/students/:studentId/messages"
              element={<TeacherSubjectPrivateThreadPage />}
            />
            <Route path="subject-offerings/:id/ca" element={<SubjectOfferingCAPage />} />
            <Route path="subject-offerings/:id/quizzes" element={<SubjectOfferingQuizzesPage />} />
            <Route path="subject-offerings/:id/results" element={<SubjectResultsPage />} />
            <Route
              path="subject-offerings/:id/communications"
              element={<SubjectOfferingCommunicationsPage />}
            />
            <Route path="assessments/:id" element={<AssessmentDetailPage />} />
            <Route path="assessments/:id/scores" element={<AssessmentGradeEntryPage />} />
            <Route path="classes" element={<SchoolClassesListPage />} />
            <Route path="classes/new" element={<FormModal list={<SchoolClassesListPage />}><SchoolClassFormPage /></FormModal>} />
            <Route path="classes/:id/edit" element={<FormModal list={<SchoolClassesListPage />}><SchoolClassFormPage /></FormModal>} />
            <Route path="classes/:id/results" element={<ClassResultsPage />} />
            <Route
              path="results/:studentId/:schoolClassId/:termId"
              element={<StudentTermReportPage />}
            />
            <Route path="students/:id/graduation-status" element={<StudentGraduationStatusPage />} />
            <Route path="sections" element={<SectionsListPage />} />
            <Route path="sections/new" element={<FormModal list={<SectionsListPage />}><SectionFormPage /></FormModal>} />
            <Route path="sections/:id/edit" element={<FormModal list={<SectionsListPage />}><SectionFormPage /></FormModal>} />
          </Route>

          <Route path="/timetable" element={<TimetableLayout />}>
            <Route index element={<Navigate to="schedule" replace />} />
            <Route path="schedule" element={<TimetableGridPage />} />
            <Route path="build" element={<BuildTimetablePage />} />
            <Route path="entries/new" element={<TimetableEntryFormPage />} />
            <Route path="entries/:id/edit" element={<TimetableEntryFormPage />} />
            <Route path="periods" element={<PeriodsListPage />} />
            <Route path="periods/new" element={<FormModal list={<PeriodsListPage />}><PeriodFormPage /></FormModal>} />
            <Route path="periods/:id/edit" element={<FormModal list={<PeriodsListPage />}><PeriodFormPage /></FormModal>} />
            <Route path="rooms" element={<RoomsListPage />} />
            <Route path="rooms/new" element={<FormModal list={<RoomsListPage />}><RoomFormPage /></FormModal>} />
            <Route path="rooms/:id/edit" element={<FormModal list={<RoomsListPage />}><RoomFormPage /></FormModal>} />
          </Route>

          <Route path="/attendance" element={<AttendanceLayout />}>
            <Route index element={<AttendanceIndexRedirect />} />
            <Route path="take" element={<TakeAttendancePage />} />
            <Route path="records" element={<AttendanceRecordsPage />} />
            <Route path="records/new" element={<FormModal list={<AttendanceRecordsPage />}><AttendanceRecordFormPage /></FormModal>} />
            <Route path="records/:id/edit" element={<FormModal list={<AttendanceRecordsPage />}><AttendanceRecordFormPage /></FormModal>} />
            <Route path="stats" element={<AttendanceStatsPage />} />
            <Route path="staff" element={<StaffAttendanceListPage />} />
            <Route path="staff/new" element={<FormModal list={<StaffAttendanceListPage />}><StaffAttendanceFormPage /></FormModal>} />
            <Route path="staff/:id/edit" element={<FormModal list={<StaffAttendanceListPage />}><StaffAttendanceFormPage /></FormModal>} />
          </Route>

          <Route path="/examinations" element={<ExaminationsLayout />}>
            <Route index element={<ExaminationsIndexRedirect />} />
            <Route path="exams" element={<ExamsListPage />} />
            <Route path="exams/new" element={<FormModal list={<ExamsListPage />}><ExamFormPage /></FormModal>} />
            <Route path="exams/:id/edit" element={<FormModal list={<ExamsListPage />}><ExamFormPage /></FormModal>} />
            <Route path="exams/:examId/schedules" element={<ExamSchedulesListPage />} />
            <Route path="exams/:examId/schedules/new" element={<FormModal list={<ExamSchedulesListPage />}><ExamScheduleFormPage /></FormModal>} />
            <Route path="exams/:examId/schedules/:id/edit" element={<FormModal list={<ExamSchedulesListPage />}><ExamScheduleFormPage /></FormModal>} />
            <Route path="timetable" element={<ExamTimetablePage />} />
            <Route path="gradebook" element={<GradebookPage />} />
            <Route path="gradebook/:id/ca" element={<SubjectOfferingCAPage />} />
            <Route path="gradebook/:id/results" element={<SubjectResultsPage />} />
            <Route path="class-results" element={<ClassResultsListPage />} />
            <Route path="class-results/:id" element={<ClassResultsPage />} />
            <Route path="class-results/report/:studentId/:schoolClassId/:termId" element={<StudentTermReportPage />} />
            <Route path="scales" element={<GradingScalesListPage />} />
            <Route path="scales/new" element={<FormModal list={<GradingScalesListPage />}><GradingScaleFormPage /></FormModal>} />
            <Route path="scales/:id/edit" element={<FormModal list={<GradingScalesListPage />}><GradingScaleFormPage /></FormModal>} />
            <Route path="scales/:scaleId/boundaries" element={<GradeBoundariesListPage />} />
            <Route path="scales/:scaleId/boundaries/new" element={<FormModal list={<GradeBoundariesListPage />}><GradeBoundaryFormPage /></FormModal>} />
            <Route path="scales/:scaleId/boundaries/:id/edit" element={<FormModal list={<GradeBoundariesListPage />}><GradeBoundaryFormPage /></FormModal>} />
          </Route>

          <Route path="/finance" element={<FinanceLayout />}>
            <Route index element={<FinanceIndexRedirect />} />
            <Route path="invoices" element={<InvoicesListPage />} />
            <Route path="invoices/new" element={<InvoiceFormPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="invoices/:invoiceId/pay" element={<PaymentFormPage />} />
            <Route path="invoices/:invoiceId/line-items" element={<InvoiceLineItemsListPage />} />
            <Route path="invoices/:invoiceId/line-items/new" element={<FormModal list={<InvoiceLineItemsListPage />}><InvoiceLineItemFormPage /></FormModal>} />
            <Route path="invoices/:invoiceId/line-items/:id/edit" element={<FormModal list={<InvoiceLineItemsListPage />}><InvoiceLineItemFormPage /></FormModal>} />
            <Route path="generate" element={<GenerateInvoicesPage />} />
            <Route path="payments" element={<PaymentsListPage />} />
            <Route path="payments/:id/refund" element={<RefundFormPage />} />
            <Route path="payments/:id/receipt" element={<PaymentReceiptPage />} />
            <Route path="structures" element={<FeeStructuresListPage />} />
            <Route path="structures/new" element={<FormModal list={<FeeStructuresListPage />} large><FeeStructureFormPage /></FormModal>} />
            <Route path="structures/:id/edit" element={<FormModal list={<FeeStructuresListPage />} large><FeeStructureFormPage /></FormModal>} />
            <Route path="structures/:structureId/items" element={<FeeStructureItemsListPage />} />
            <Route path="structures/:structureId/items/new" element={<FormModal list={<FeeStructureItemsListPage />}><FeeStructureItemFormPage /></FormModal>} />
            <Route path="structures/:structureId/items/:id/edit" element={<FormModal list={<FeeStructureItemsListPage />}><FeeStructureItemFormPage /></FormModal>} />
            <Route path="categories" element={<FeeCategoriesListPage />} />
            <Route path="categories/new" element={<FormModal list={<FeeCategoriesListPage />}><FeeCategoryFormPage /></FormModal>} />
            <Route path="categories/:id/edit" element={<FormModal list={<FeeCategoriesListPage />}><FeeCategoryFormPage /></FormModal>} />
            <Route path="stats" element={<FinanceStatsPage />} />
          </Route>

          <Route path="/salary" element={<SalaryLayout />}>
            <Route index element={<SalaryIndexRedirect />} />
            <Route path="payments" element={<SalaryPaymentsListPage />} />
            <Route path="payments/:id/pay" element={<PaySalaryPaymentPage />} />
            <Route path="payments/:id/receipt" element={<SalaryPaymentReceiptPage />} />
            <Route path="generate" element={<GenerateSalaryPaymentsPage />} />
            <Route path="structures" element={<SalaryStructuresListPage />} />
            <Route path="structures/new" element={<FormModal list={<SalaryStructuresListPage />} large><SalaryStructureFormPage /></FormModal>} />
            <Route path="structures/:id/edit" element={<FormModal list={<SalaryStructuresListPage />} large><SalaryStructureFormPage /></FormModal>} />
            <Route path="structures/:structureId/items" element={<SalaryStructureItemsListPage />} />
            <Route path="structures/:structureId/items/new" element={<FormModal list={<SalaryStructureItemsListPage />}><SalaryStructureItemFormPage /></FormModal>} />
            <Route path="structures/:structureId/items/:id/edit" element={<FormModal list={<SalaryStructureItemsListPage />}><SalaryStructureItemFormPage /></FormModal>} />
            <Route path="assignments" element={<StaffSalaryAssignmentsListPage />} />
            <Route path="assignments/new" element={<FormModal list={<StaffSalaryAssignmentsListPage />}><StaffSalaryAssignmentFormPage /></FormModal>} />
            <Route path="assignments/:id/edit" element={<FormModal list={<StaffSalaryAssignmentsListPage />}><StaffSalaryAssignmentFormPage /></FormModal>} />
          </Route>

          <Route path="/hostel" element={<HostelLayout />}>
            <Route index element={<Navigate to="hostels" replace />} />
            <Route path="hostels" element={<HostelsListPage />} />
            <Route path="hostels/new" element={<FormModal list={<HostelsListPage />}><HostelFormPage /></FormModal>} />
            <Route path="hostels/:id/edit" element={<FormModal list={<HostelsListPage />}><HostelFormPage /></FormModal>} />
            <Route path="hostels/:hostelId/rooms" element={<HostelRoomsListPage />} />
            <Route path="hostels/:hostelId/rooms/new" element={<FormModal list={<HostelRoomsListPage />}><HostelRoomFormPage /></FormModal>} />
            <Route path="hostels/:hostelId/rooms/:id/edit" element={<FormModal list={<HostelRoomsListPage />}><HostelRoomFormPage /></FormModal>} />
            <Route path="hostels/:hostelId/rooms/:roomId/beds" element={<BedsListPage />} />
            <Route path="hostels/:hostelId/rooms/:roomId/beds/new" element={<FormModal list={<BedsListPage />}><BedFormPage /></FormModal>} />
            <Route path="hostels/:hostelId/rooms/:roomId/beds/:id/edit" element={<FormModal list={<BedsListPage />}><BedFormPage /></FormModal>} />
            <Route path="allocations" element={<AllocationsListPage />} />
            <Route path="allocations/new" element={<FormModal list={<AllocationsListPage />}><AllocationFormPage /></FormModal>} />
          </Route>

          <Route path="/library" element={<LibraryLayout />}>
            <Route index element={<Navigate to="checkout" replace />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="loans" element={<LoansListPage />} />
            <Route path="reservations" element={<ReservationsListPage />} />
            <Route path="reservations/new" element={<FormModal list={<ReservationsListPage />}><ReservationFormPage /></FormModal>} />
            <Route path="books" element={<BooksListPage />} />
            <Route path="books/new" element={<FormModal list={<BooksListPage />}><BookFormPage /></FormModal>} />
            <Route path="books/:id/edit" element={<FormModal list={<BooksListPage />}><BookFormPage /></FormModal>} />
            <Route path="books/:bookId/copies" element={<BookCopiesListPage />} />
            <Route path="books/:bookId/copies/new" element={<FormModal list={<BookCopiesListPage />}><BookCopyFormPage /></FormModal>} />
            <Route path="books/:bookId/copies/:id/edit" element={<FormModal list={<BookCopiesListPage />}><BookCopyFormPage /></FormModal>} />
            <Route path="categories" element={<CategoriesListPage />} />
            <Route path="categories/new" element={<FormModal list={<CategoriesListPage />}><CategoryFormPage /></FormModal>} />
            <Route path="categories/:id/edit" element={<FormModal list={<CategoriesListPage />}><CategoryFormPage /></FormModal>} />
          </Route>

          <Route path="/medical" element={<MedicalLayout />}>
            <Route index element={<Navigate to="profiles" replace />} />
            <Route path="profiles" element={<ProfilesListPage />} />
            <Route path="profiles/new" element={<FormModal list={<ProfilesListPage />} large><ProfileFormPage /></FormModal>} />
            <Route path="profiles/:id/edit" element={<FormModal list={<ProfilesListPage />} large><ProfileFormPage /></FormModal>} />
            <Route path="visits" element={<VisitsListPage />} />
            <Route path="visits/new" element={<FormModal list={<VisitsListPage />} large><VisitFormPage /></FormModal>} />
            <Route path="visits/:id/edit" element={<FormModal list={<VisitsListPage />} large><VisitFormPage /></FormModal>} />
          </Route>

          <Route path="/transport" element={<TransportLayout />}>
            <Route index element={<Navigate to="vehicles" replace />} />
            <Route path="vehicles" element={<VehiclesListPage />} />
            <Route path="vehicles/new" element={<FormModal list={<VehiclesListPage />}><VehicleFormPage /></FormModal>} />
            <Route path="vehicles/:id/edit" element={<FormModal list={<VehiclesListPage />}><VehicleFormPage /></FormModal>} />
            <Route path="vehicles/:vehicleId/maintenance" element={<VehicleMaintenanceListPage />} />
            <Route path="vehicles/:vehicleId/maintenance/new" element={<FormModal list={<VehicleMaintenanceListPage />}><VehicleMaintenanceFormPage /></FormModal>} />
            <Route path="vehicles/:vehicleId/maintenance/:id/edit" element={<FormModal list={<VehicleMaintenanceListPage />}><VehicleMaintenanceFormPage /></FormModal>} />
            <Route path="routes" element={<RoutesListPage />} />
            <Route path="routes/new" element={<FormModal list={<RoutesListPage />}><RouteFormPage /></FormModal>} />
            <Route path="routes/:id/edit" element={<FormModal list={<RoutesListPage />}><RouteFormPage /></FormModal>} />
            <Route path="routes/:routeId/stops" element={<StopsListPage />} />
            <Route path="routes/:routeId/stops/new" element={<FormModal list={<StopsListPage />}><StopFormPage /></FormModal>} />
            <Route path="routes/:routeId/stops/:id/edit" element={<FormModal list={<StopsListPage />}><StopFormPage /></FormModal>} />
            <Route path="assignments" element={<AssignmentsListPage />} />
            <Route path="assignments/new" element={<FormModal list={<AssignmentsListPage />}><AssignmentFormPage /></FormModal>} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

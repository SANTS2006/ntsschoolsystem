/** What the platform does, grouped for the website. Every capability listed here was checked against the application's
 * code (see docs/product-audit.md); nothing is listed that does not exist. */

export type IconName =
  | "students" | "admissions" | "academics" | "attendance" | "exams" | "finance" | "megaphone" | "library" | "bed"
  | "bus" | "heart" | "shield" | "settings" | "chart" | "video" | "calendar" | "users" | "building" | "lock" | "mail"
  | "check" | "arrow" | "file" | "key";

export interface ModuleGroup {
  slug: string;
  title: string;
  icon: IconName;
  summary: string;
  problem: string;
  capabilities: string[];
  workflow: string[];
  users: string[];
  benefit: string;
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    slug: "student-records",
    title: "Students & admissions",
    icon: "students",
    summary: "Admissions, student records, guardians, ID cards and transcripts in one place.",
    problem: "Student information is often scattered across registers, spreadsheets and filing cabinets, so finding a record or producing a document takes time.",
    capabilities: [
      "Student profiles with admission number, class, section, status and photo",
      "Guardians (parents) recorded against each student, with one marked as the emergency contact",
      "A configurable online application form for new applicants, with applications reviewed, shortlisted, scheduled for interview, accepted or rejected",
      "Login accounts created for students, with the school's default password flow and forced first-time password change",
      "Printable student ID cards and verifiable card links",
      "Student transcripts built from published results only",
      "Promotion of students between classes and graduation status tracking",
      "Records and documents the school chooses to keep, with files attached",
    ],
    workflow: ["Applicant submits the school's application form", "Staff review and shortlist applications", "An accepted applicant becomes a student with a login", "Student is placed in a class and section", "Guardians are linked and records stay current each term"],
    users: ["School administrators", "Principals", "Teachers (their own students)", "Students (their own records)"],
    benefit: "Authorised staff find a student's record, guardian contacts and documents in seconds instead of searching paper files.",
  },
  {
    slug: "academics-and-exams",
    title: "Academics & exams",
    icon: "exams",
    summary: "Years, terms, classes, subjects, continuous assessment, exams, results and report cards.",
    problem: "Marks are collected on paper or in separate spreadsheets, combined by hand, and released inconsistently.",
    capabilities: [
      "Academic years and terms, departments, subjects, classes and sections",
      "Subject offerings that assign a teacher (and optional assistant) to each subject and class for a term",
      "Continuous assessment (CA): teachers add weighted assessments, enter scores, and the system combines them with the exam by the subject's CA/exam split",
      "Assessments that take file uploads from students, with a teacher-set deadline, reminders by app and e-mail, and teacher marking",
      "Assignments and quizzes for students, with teacher grading and feedback",
      "Examinations, papers and grading scales with grade boundaries",
      "A result workflow from draft through submitted, reviewed and approved to published and locked",
      "Gradebook, class results and a publish step; published results appear in the student's own transcript and term report",
      "An exam timetable with rooms, invigilators and seating that students and teachers see once it is published",
      "Teacher and student timetables built from periods and rooms, with clash prevention",
    ],
    workflow: ["Set up the year, terms and classes", "Assign teachers to subjects", "Teachers record CA and exam marks", "Exams staff review, approve and publish", "Students and staff see published results and reports"],
    users: ["Teachers", "Exams directors", "School administrators", "Students"],
    benefit: "Marks are calculated the same way every time, only approved results are published, and students see their own results without waiting for printed sheets.",
  },
  {
    slug: "finance",
    title: "Fees & finance",
    icon: "finance",
    summary: "Fee structures, invoices, payments, receipts, refunds and staff payroll.",
    problem: "Fee collection is hard to track when invoices, payments and balances live in different books.",
    capabilities: [
      "Fee categories and fee structures by academic year, term and class",
      "Invoices generated for students, with line items, discounts and automatically maintained balances",
      "Payments recorded against invoices (cash, bank transfer, card, mobile money, cheque or other) with printable receipts",
      "Partial payments and refunds, with invoice status kept in step",
      "Finance statistics: billed, collected, outstanding and overdue amounts",
      "Salary structures, staff salary assignments, payroll generation and payments",
      "Inventory items and stock movements, and procurement (suppliers, purchase requests and purchase orders)",
    ],
    workflow: ["Define fee categories and structures", "Generate invoices for a class or term", "Record each payment and issue a receipt", "Review outstanding and overdue balances", "Run payroll for staff"],
    users: ["Accountants", "School administrators", "Principals"],
    benefit: "Staff see who has paid, who owes what, and what has been collected, from one set of records.",
  },
  {
    slug: "communication",
    title: "Communication",
    icon: "megaphone",
    summary: "Announcements, events, live meetings and notifications that reach exactly the right people.",
    problem: "Important notices miss people, or reach everyone when they should reach one class.",
    capabilities: [
      "Announcements and events with a chosen audience: everybody, selected classes and sections, selected departments, or specific people",
      "An option to make an item visible only to its audience",
      "In-app notifications and e-mail for the people an item reaches",
      "Event registration with an optional capacity",
      "Live meetings with invitations by e-mail, for staff, parents and students",
      "Live lessons by video for a class, section or chosen students",
      "Complaints that students and staff can submit and that the school can respond to",
      "Notifications that appear within seconds, without reloading the page",
    ],
    workflow: ["Write the announcement or event", "Choose who it is for", "Publish: people are notified in the app and by e-mail", "Track registrations or responses"],
    users: ["Administrators", "Teachers", "Students", "Guardians (by e-mail)"],
    benefit: "Messages go to the right audience, and people are told straight away without anyone phoning around.",
  },
  {
    slug: "campus-operations",
    title: "Campus operations",
    icon: "building",
    summary: "Attendance, library, hostel, transport, medical and discipline records.",
    problem: "Day-to-day campus services are managed in separate books that nobody can see together.",
    capabilities: [
      "Student attendance (daily or by period) and staff attendance, with statistics and a personal attendance view",
      "A library catalogue with copies, loans, returns, fines and reservations; students and teachers can browse, reserve and borrow, and the librarian approves or rejects reservations",
      "Hostels, rooms and beds, with students allocated to beds and told by notification and e-mail",
      "Transport vehicles, routes, stops, student assignments and vehicle maintenance",
      "Medical profiles and visit records",
      "Discipline incidents with follow-up status",
    ],
    workflow: ["Teachers take attendance", "Library, hostel and transport staff manage their own records", "Students see their own library, hostel and attendance information"],
    users: ["Teachers", "Librarians", "Hostel wardens", "Transport and medical staff", "Students"],
    benefit: "Each service keeps its own accurate records, and students can check their own details without asking.",
  },
  {
    slug: "administration-and-security",
    title: "Administration & security",
    icon: "settings",
    summary: "Roles and permissions, school branding, audit log, backups and platform administration.",
    problem: "Schools need the right people to see the right things, and a record of who changed what.",
    capabilities: [
      "Standard roles (Principal, School Administrator, Teacher, Accountant, Exams Director, Student) that can be edited, deactivated or deleted, plus roles the school creates itself",
      "Permissions assigned to roles from the screen; people holding several roles choose which role to work as",
      "A dashboard for each role, and for any role the school creates, built from what that role can access",
      "Each school has its own address, branded sign-in page, name, logo and colour",
      "An audit log of important actions",
      "Two-factor authentication (mandatory for the principal and platform administrators, optional for others)",
      "Encrypted database backups with verification, retention and a guided restore, and optional storage in S3-compatible object storage",
      "A platform console for the NTS team: schools, platform administrators and maintenance mode",
      "Installable as an app on a phone or computer (progressive web app)",
    ],
    workflow: ["NTS creates the school", "The school administrator signs in and configures roles and settings", "Staff and students receive accounts", "Permissions are adjusted as the school's needs change"],
    users: ["School administrators", "Principals", "Platform administrators (NTS)"],
    benefit: "Access follows each person's job, and the school can see what happened and recover if something goes wrong.",
  },
];

export const MODULE_BY_SLUG = Object.fromEntries(MODULE_GROUPS.map((m) => [m.slug, m]));

export const ROLES = [
  {
    id: "administrators",
    title: "School administrators & principals",
    summary: "Run the school: students, staff, academics, admissions, fees, communications and settings.",
    points: ["See a dashboard built for their role, with attendance, fees, enrolment and results waiting for approval", "Set up academic years, classes and subjects, and assign teachers", "Review admissions and register students and staff", "Manage roles and permissions, and read the audit log", "Principals must use two-factor authentication"],
  },
  {
    id: "teachers",
    title: "Teachers",
    summary: "Teach, mark and communicate, seeing only their own classes and students.",
    points: ["See today's lessons, classes and marking waiting for them", "Take attendance", "Set assignments and assessments (optionally with file uploads and deadlines) and mark them", "Enter continuous assessment scores and see a ranked CA summary", "Schedule live lessons for the subjects and classes they teach", "See their invigilation duties once the exam timetable is published"],
  },
  {
    id: "students",
    title: "Students",
    summary: "A personal view of their own school life.",
    points: ["Own timetable, attendance, subjects, CA scores and published results", "Assignments to submit and files to upload for assessments, with deadlines and grades", "Exam timetable with room, seat and invigilators", "Library: browse, reserve and borrow books", "Hostel details, live lessons, quizzes, announcements and events meant for them"],
  },
  {
    id: "finance",
    title: "Accountants & finance staff",
    summary: "Keep fee and payroll records straight.",
    points: ["Fee structures, invoices and payments with receipts", "Outstanding and overdue balances at a glance", "Refunds, salary structures and payroll", "Inventory and procurement"],
  },
  {
    id: "exams",
    title: "Exams directors",
    summary: "Run the examination cycle without touching teaching data.",
    points: ["Build and publish the exam timetable with rooms and invigilators", "Review, approve and publish results", "Open and close continuous assessment for a subject", "A dashboard of results by workflow stage"],
  },
  {
    id: "other-staff",
    title: "Librarians, wardens, medical and transport staff",
    summary: "Roles a school creates for its own services.",
    points: ["Roles with exactly the permissions the school chooses", "A dashboard built automatically from those permissions", "Library reservations, hostel allocations, medical visits and vehicle records"],
  },
  {
    id: "platform",
    title: "Platform administrators (NTS Digital Solutions)",
    summary: "Look after the platform itself.",
    points: ["Create and manage schools and platform administrators", "Maintenance mode and platform-wide backups", "Website enquiries in one place"],
  },
] as const;

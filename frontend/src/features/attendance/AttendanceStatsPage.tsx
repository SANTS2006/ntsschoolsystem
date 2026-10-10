import { CheckCircle2, Clock, LogOut, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useSubjectList } from "@/features/academics/useAcademicsCrud";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { StatCard } from "@/features/dashboard/StatCard";
import type { ApiError } from "@/lib/api-client";

import { useAttendanceStats } from "./useAttendanceCrud";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceStatsPage() {
  const [date, setDate] = useState(todayIsoDate);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const { data: sections } = useAllSections();
  const { data: subjects } = useSubjectList({ page_size: 100 });

  const { data: stats, isLoading, isError, error } = useAttendanceStats({
    date: date || undefined,
    section: sectionId || undefined,
    subject: subjectId || undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-[160px]">
          <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-full max-w-xs">
          <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections?.map((section) => (
              <option key={section.id} value={section.id}>
                {section.school_class_name} - {section.name} ({section.academic_year_name})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-[180px]">
          <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">All subjects</option>
            {subjects?.results.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={CheckCircle2} label="Present" value={stats.present} tone="success" />
          <StatCard icon={XCircle} label="Absent" value={stats.absent} tone="danger" />
          <StatCard icon={Clock} label="Late" value={stats.late} tone="warning" />
          <StatCard icon={ShieldCheck} label="Excused" value={stats.excused} tone="neutral" />
          <StatCard icon={LogOut} label="Early departure" value={stats.early_departure} tone="warning" />
        </div>
      ) : null}
    </div>
  );
}

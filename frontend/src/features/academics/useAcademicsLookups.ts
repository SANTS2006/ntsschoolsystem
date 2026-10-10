import { useQuery } from "@tanstack/react-query";

import { listAcademicYears, listSchoolClasses, listSections, listSubjects } from "./api";

export function useAcademicYears() {
  return useQuery({ queryKey: ["academics", "academic-years"], queryFn: listAcademicYears });
}

export function useSchoolClasses() {
  return useQuery({ queryKey: ["academics", "classes"], queryFn: listSchoolClasses });
}

export function useSections(params?: { school_class?: string; academic_year?: string }) {
  return useQuery({
    queryKey: ["academics", "sections", params],
    queryFn: () => listSections(params),
    enabled: !!params?.school_class,
  });
}

/** Every section across every class/year, unfiltered — for pickers that let the user choose
 * a section directly (e.g. Timetable's schedule view) rather than cascading through a class
 * first. `useSections()` above stays gated on `school_class` for its existing callers. */
export function useAllSections() {
  return useQuery({ queryKey: ["academics", "sections", "all"], queryFn: () => listSections() });
}

export function useSubjects() {
  return useQuery({ queryKey: ["academics", "subjects"], queryFn: listSubjects });
}

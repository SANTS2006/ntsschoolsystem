import { ArrowRight, School, Search, SearchX } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { searchSchools } from "@/features/schools/api";
import type { SchoolBranding } from "@/features/schools/types";
import type { ApiError } from "@/lib/api-client";
import { goTo, schoolPath } from "@/lib/schoolSlug";

import { AuthCard } from "./components/AuthCard";
import { BrandMark } from "./components/BrandMark";
import { authButtonClass, authInputClass } from "./components/authStyles";

type Result =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; schools: SchoolBranding[] }
  | { state: "none" }
  | { state: "error"; message: string };

/** "Find your school": the person types their school's name; if the platform administrator has registered it
 * they are taken to that school's own sign-in page, otherwise they are told to contact their school. */
export function FindSchoolPage() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result>({ state: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const query = name.trim();
    if (!query) return;
    setResult({ state: "searching" });
    try {
      const schools = await searchSchools(query);
      if (schools.length === 0) {
        setResult({ state: "none" });
      } else if (schools.length === 1) {
        // Registered: straight to that school's sign-in page.
        setResult({ state: "found", schools });
        goTo(schoolPath(schools[0].slug, "/login"));
      } else {
        // Several schools share part of that name: let the person pick theirs.
        setResult({ state: "found", schools });
      }
    } catch (err) {
      setResult({ state: "error", message: (err as ApiError).message ?? "Something went wrong. Please try again." });
    }
  };

  return (
    <AuthCard
      mark={<BrandMark />}
      subtitle="NTS School System"
      title="Find your school"
      footer={
        <p className="mt-5 text-xs text-[var(--color-text-muted)]">
          Platform administrator?{" "}
          <a href="/login" className="font-medium text-[var(--color-primary)]">
            Sign in here
          </a>
        </p>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Enter the name of your school and we&apos;ll take you to its sign-in page.
        </p>
        <Input
          label="School name"
          icon={School}
          placeholder="e.g. Greenwood High School"
          autoComplete="organization"
          autoFocus
          className={authInputClass}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (result.state !== "searching") setResult({ state: "idle" });
          }}
        />
        <Button type="submit" isLoading={result.state === "searching"} disabled={!name.trim()} className={authButtonClass}>
          {result.state !== "searching" && <Search className="size-4" aria-hidden="true" />}
          Find my school
        </Button>
      </form>

      {result.state === "none" && (
        <Alert tone="warning" className="mt-5">
          <span className="flex items-start gap-2">
            <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              We couldn&apos;t find a school called &ldquo;{name.trim()}&rdquo;. It may not be registered yet, or the
              name may be spelled differently. Please contact your school&apos;s administrator.
            </span>
          </span>
        </Alert>
      )}
      {result.state === "error" && (
        <Alert tone="danger" className="mt-5">
          {result.message}
        </Alert>
      )}
      {result.state === "found" && result.schools.length > 1 && (
        <ul className="mt-5 flex flex-col gap-2" aria-label="Matching schools">
          {result.schools.map((school) => (
            <li key={school.slug}>
              <a
                href={schoolPath(school.slug, "/login")}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-bg-subtle)]">
                  {school.logo || school.logo_url ? (
                    <img src={school.logo || school.logo_url} alt="" className="size-full object-cover" />
                  ) : (
                    <School className="size-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{school.name}</span>
                <ArrowRight className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </AuthCard>
  );
}

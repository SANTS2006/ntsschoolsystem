import { Search } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/Input";
import { useGuardianList } from "@/features/parents/useParentsCrud";
import { useStaffList } from "@/features/staff/useStaffCrud";
import { useStudents } from "@/features/students/useStudents";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/cn";

import { type AudienceState, EMPTY_AUDIENCE, type GroupKey, type GroupMode } from "./audience";

const GROUPS: { key: GroupKey; label: string; everyone: string }[] = [
  { key: "staff", label: "Staff", everyone: "All staff" },
  { key: "parents", label: "Parents", everyone: "All parents" },
  { key: "students", label: "Students", everyone: "All students" },
];

type Option = { id: string; label: string };

function PickList({
  options,
  selected,
  onToggle,
  search,
  onSearch,
  isLoading,
}: {
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Input icon={Search} placeholder="Search by name…" value={search} onChange={(e) => onSearch(e.target.value)} />
      <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)]">
        {isLoading && options.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : options.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-text-muted)]">No matches.</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={() => onToggle(option.id)}
                className="size-4 rounded border-[var(--color-border)]"
              />
              {option.label}
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{selected.length} selected</p>
    </div>
  );
}

// One component per group so each list's data hook only runs while that group is in "choose people" mode.
function StaffPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data, isLoading } = useStaffList({ search: debounced || undefined, page_size: 30 });
  const options = (data?.results ?? []).map((s) => ({ id: s.id, label: s.full_name }));
  return <PickList options={options} selected={selected} onToggle={onToggle} search={search} onSearch={setSearch} isLoading={isLoading} />;
}

function ParentPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data, isLoading } = useGuardianList({ search: debounced || undefined, page_size: 30 });
  const options = (data?.results ?? []).map((g) => ({ id: g.id, label: g.full_name }));
  return <PickList options={options} selected={selected} onToggle={onToggle} search={search} onSearch={setSearch} isLoading={isLoading} />;
}

function StudentPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data, isLoading } = useStudents({ search: debounced || undefined, page_size: 30, status: "active" });
  const options = (data?.results ?? []).map((s) => ({ id: s.id, label: `${s.full_name} (${s.admission_number})` }));
  return <PickList options={options} selected={selected} onToggle={onToggle} search={search} onSearch={setSearch} isLoading={isLoading} />;
}

export function AudiencePicker({
  value,
  onChange,
}: {
  value: AudienceState;
  onChange: (next: AudienceState) => void;
}) {
  const everybody = GROUPS.every((g) => value[g.key].mode === "all");

  const setMode = (key: GroupKey, mode: GroupMode) => onChange({ ...value, [key]: { ...value[key], mode } });
  const toggleId = (key: GroupKey, id: string) => {
    const ids = value[key].ids.includes(id) ? value[key].ids.filter((x) => x !== id) : [...value[key].ids, id];
    onChange({ ...value, [key]: { ...value[key], ids } });
  };
  const setEverybody = () =>
    onChange({
      staff: { ...value.staff, mode: "all" },
      parents: { ...value.parents, mode: "all" },
      students: { ...value.students, mode: "all" },
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={everybody ? () => onChange(EMPTY_AUDIENCE) : setEverybody}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            everybody
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
              : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]",
          )}
        >
          Everybody — staff, parents &amp; students
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">or choose for each group below</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {GROUPS.map((group) => {
          const state = value[group.key];
          return (
            <fieldset key={group.key} className="rounded-lg border border-[var(--color-border)] p-3">
              <legend className="px-1 text-sm font-semibold text-[var(--color-text)]">{group.label}</legend>
              {(
                [
                  ["none", "Not invited"],
                  ["all", group.everyone],
                  ["some", "Choose people"],
                ] as [GroupMode, string][]
              ).map(([mode, label]) => (
                <label key={mode} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-[var(--color-text)]">
                  <input
                    type="radio"
                    name={`audience-${group.key}`}
                    checked={state.mode === mode}
                    onChange={() => setMode(group.key, mode)}
                  />
                  {label}
                </label>
              ))}
              {state.mode === "some" && group.key === "staff" && (
                <StaffPicker selected={state.ids} onToggle={(id) => toggleId("staff", id)} />
              )}
              {state.mode === "some" && group.key === "parents" && (
                <ParentPicker selected={state.ids} onToggle={(id) => toggleId("parents", id)} />
              )}
              {state.mode === "some" && group.key === "students" && (
                <StudentPicker selected={state.ids} onToggle={(id) => toggleId("students", id)} />
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

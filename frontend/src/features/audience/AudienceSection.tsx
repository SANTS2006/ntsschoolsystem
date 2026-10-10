import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/cn";

import { type AudienceType, type AudienceValue, fetchAudienceOptions, fetchAudiencePeople, type Person } from "./audience";

const TYPES: { key: AudienceType; label: string; hint: string }[] = [
  { key: "all", label: "Everybody", hint: "Everyone in the school" },
  { key: "groups", label: "Classes & departments", hint: "Choose classes, sections and departments" },
  { key: "specific", label: "Specific people", hint: "Pick people or type e-mail addresses" },
];

function CheckList({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        {hint && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-2">{children}</div>
    </div>
  );
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function PeoplePicker({ value, onChange }: { value: AudienceValue; onChange: (next: AudienceValue) => void }) {
  const { data: options } = useQuery({ queryKey: ["audience", "options"], queryFn: fetchAudienceOptions, staleTime: 60_000 });
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data: people, isLoading } = useQuery({
    queryKey: ["audience", "people", role, debounced],
    queryFn: () => fetchAudiencePeople({ role: role || undefined, search: debounced || undefined }),
  });
  const chosen = new Set(value.people.map((p) => p.id));
  const add = (p: Person) =>
    onChange({ ...value, people: chosen.has(p.id) ? value.people.filter((x) => x.id !== p.id) : [...value.people, p] });

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        label="E-mail addresses"
        placeholder="name@example.com, another@example.com"
        value={value.emails}
        onChange={(e) => onChange({ ...value, emails: e.target.value })}
        hint="Separate with commas, spaces or new lines. Each must belong to a user of this school."
      />
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
        <p className="text-sm font-medium text-[var(--color-text)]">Or pick people by role</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {options?.roles.map((r) => (
              <option key={r.id} value={r.slug}>
                {r.name}
              </option>
            ))}
          </Select>
          <Input icon={Search} placeholder="Search by name or e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {isLoading ? (
            <p className="p-3 text-sm text-[var(--color-text-muted)]">Loading…</p>
          ) : !people || people.length === 0 ? (
            <p className="p-3 text-sm text-[var(--color-text-muted)]">No one found.</p>
          ) : (
            people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={() => add(p)} className="size-4 accent-[var(--color-primary)]" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="truncate text-xs text-[var(--color-text-muted)]">{p.email}</span>
              </label>
            ))
          )}
        </div>
        {value.people.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.people.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-subtle)] px-2.5 py-1 text-xs text-[var(--color-text)]">
                {p.name || "Selected person"}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => add(p)}>
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--color-text-muted)]">{value.people.length} picked</p>
      </div>
    </div>
  );
}

/** "Who is this for?" — shared by events, announcements and anything else that goes to an audience.
 * Everybody: nothing more to choose. Classes: every class can be ticked, and only the sections of the ticked classes
 * then appear; departments can be ticked as well. Specific people: typed e-mails and/or picked by role. A final switch
 * decides whether the item is visible to everyone with access to the module or only to the audience. */
export function AudienceSection({ value, onChange }: { value: AudienceValue; onChange: (next: AudienceValue) => void }) {
  const { data: options } = useQuery({ queryKey: ["audience", "options"], queryFn: fetchAudienceOptions, staleTime: 60_000 });
  const shownSections = options?.sections.filter((s) => value.classes.includes(s.school_class)) ?? [];

  const setType = (type: AudienceType) => onChange({ ...value, type });
  const toggleClass = (id: string) => {
    const classes = toggle(value.classes, id);
    // dropping a class drops its sections too
    const keep = new Set(options?.sections.filter((s) => classes.includes(s.school_class)).map((s) => s.id));
    onChange({ ...value, classes, sections: value.sections.filter((s) => keep.has(s)) });
  };

  return (
    <fieldset className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--color-text)]">Who is this for?</legend>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audience">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={value.type === t.key}
            title={t.hint}
            onClick={() => setType(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              value.type === t.key
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {value.type === "all" && (
        <p className="text-sm text-[var(--color-text-muted)]">Every user in the school will be notified, in the app and by e-mail.</p>
      )}

      {value.type === "groups" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CheckList title="Classes" hint="Tick one or more">
            {options?.classes.map((c) => (
              <Checkbox key={c.id} label={c.name} checked={value.classes.includes(c.id)} onChange={() => toggleClass(c.id)} />
            ))}
            {options && options.classes.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No classes yet.</p>}
          </CheckList>

          {value.classes.length > 0 && (
            <CheckList title="Sections" hint="Optional — leave empty for the whole class. Only sections of the classes you ticked are shown.">
              {shownSections.map((s) => (
                <Checkbox
                  key={s.id}
                  label={`${s.school_class_name} — ${s.name}`}
                  checked={value.sections.includes(s.id)}
                  onChange={() => onChange({ ...value, sections: toggle(value.sections, s.id) })}
                />
              ))}
              {shownSections.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">These classes have no sections.</p>}
            </CheckList>
          )}

          <CheckList title="Departments" hint="Staff in the departments you tick are included">
            {options?.departments.map((d) => (
              <Checkbox key={d.id} label={d.name} checked={value.departments.includes(d.id)} onChange={() => onChange({ ...value, departments: toggle(value.departments, d.id) })} />
            ))}
            {options && options.departments.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No departments yet.</p>}
          </CheckList>

          {value.classes.length > 0 && (
            <div className="self-end">
              <Checkbox
                label="Also notify the parents of these students"
                checked={value.includeParents}
                onChange={(e) => onChange({ ...value, includeParents: e.target.checked })}
              />
            </div>
          )}
        </div>
      )}

      {value.type === "specific" && <PeoplePicker value={value} onChange={onChange} />}

      <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3">
        <Checkbox
          label="Only this audience can see it"
          hint="On: nobody else sees it — not even people with access to this module. Off: everyone who can view this module can also see it."
          checked={value.restricted}
          onChange={(e) => onChange({ ...value, restricted: e.target.checked })}
        />
      </div>
    </fieldset>
  );
}

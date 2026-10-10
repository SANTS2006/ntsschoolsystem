import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, LogOut, Settings, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "@/components/ui/Avatar";
import { useActiveRole, useCurrentUser } from "@/features/auth/useAuth";
import { useSignOut } from "@/features/auth/useSignOut";
import type { CurrentUser } from "@/types/auth";
import { cn } from "@/lib/cn";

function roleLabel(user: CurrentUser, activeRoleName?: string): string | null {
  if (activeRoleName) return activeRoleName;
  if (user.roles.length > 0) return user.roles.map((role) => role.name).join(" / ");
  if (user.is_platform_admin) return "Platform Administrator";
  return null;
}

export function UserMenu() {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { activeRole, setActiveRoleSlug } = useActiveRole();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!user) {
    return null;
  }

  const role = roleLabel(user, activeRole?.name);
  const canSwitchRoles = user.available_roles.length > 1;

  const handleLogout = () => {
    setIsOpen(false);
    void signOut();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2.5 rounded-[var(--radius-md)] py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-[var(--color-bg-subtle)]"
      >
        <Avatar src={user.photo} name={user.full_name} isOnline={user.is_online} />
        <span className="hidden flex-col items-start text-left sm:flex">
          <span className="max-w-[10rem] truncate text-sm font-medium leading-tight text-[var(--color-text)]">
            {user.full_name}
          </span>
          {role && (
            <span className="max-w-[10rem] truncate text-xs leading-tight text-[var(--color-text-muted)]">{role}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
          >
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{user.full_name}</p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">{user.email}</p>
              {role && <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{role}</p>}
            </div>
            {canSwitchRoles && (
              <div className="border-b border-[var(--color-border)] p-1.5">
                <p className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  <UserCog className="size-3.5" aria-hidden="true" />
                  Switch role
                </p>
                {user.available_roles.map((userRole) => (
                  <button
                    key={userRole.id}
                    type="button"
                    onClick={() => setActiveRoleSlug(userRole.slug)}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors duration-200 hover:bg-[var(--color-bg-subtle)]"
                  >
                    <span className="truncate">{userRole.name}</span>
                    {user.active_role_slug === userRole.slug && (
                      <Check className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col p-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate("/settings");
                }}
                className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors duration-200 hover:bg-[var(--color-bg-subtle)]"
              >
                <Settings className="size-4" aria-hidden="true" />
                Settings
              </button>
              <button
                type="button"
                onClick={handleLogout}
                
                className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-danger)] transition-colors duration-200 hover:bg-[var(--color-danger)]/10 disabled:opacity-60"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

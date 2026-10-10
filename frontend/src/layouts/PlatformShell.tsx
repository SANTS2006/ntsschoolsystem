import { AnimatePresence, motion } from "framer-motion";
import { Bell, Inbox, LayoutDashboard, Menu, School as SchoolIcon, Settings, DatabaseBackup, Shield, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink } from "react-router-dom";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser } from "@/features/auth/useAuth";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { cn } from "@/lib/cn";

import { PageOutlet } from "@/components/ErrorBoundary";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";

import { LogoBadge } from "./AppShell";
import { Footer } from "./Footer";
import { UserMenu } from "./UserMenu";

const NAV_ITEMS = [
  { to: "/platform/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/platform/schools", label: "Schools", icon: SchoolIcon },
  { to: "/platform/admins", label: "Platform admins", icon: Shield },
  { to: "/platform/enquiries", label: "Website enquiries", icon: Inbox },
  { to: "/platform/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/platform/backups", label: "Backup & Recovery", icon: DatabaseBackup },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
];

function PlatformSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-5">
        <LogoBadge platform />
        <span className="truncate text-sm font-semibold tracking-tight text-[var(--sidebar-fg)]">Platform console</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-[image:var(--gradient-primary)] text-white shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--brand-primary)_80%,transparent)]"
                  : "text-[var(--sidebar-fg-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)]",
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function PlatformShell() {
  const { data: user } = useCurrentUser();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Mirror of AppShell's guard — a school user has no business in the platform console (every
  // page here operates across every tenant, gated purely on is_platform_admin, not the normal
  // school-scoped Permission/Role catalog).
  if (user && !user.is_platform_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[var(--color-bg-subtle)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[image:var(--gradient-sidebar)] lg:sticky lg:top-0 lg:flex lg:h-full">
        <PlatformSidebarContent />
      </aside>

      <AnimatePresence>
        {isMobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-[#0b0d1a]/55 backdrop-blur-sm"
              onClick={() => setIsMobileNavOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              className="relative flex h-full w-72 max-w-[85vw] flex-col bg-[image:var(--gradient-sidebar)] shadow-[var(--shadow-md)]"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setIsMobileNavOpen(false)}
                className="absolute right-3 top-4 rounded-full p-1.5 text-[var(--sidebar-fg-muted)] transition-colors duration-200 hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)]"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              <PlatformSidebarContent onNavigate={() => setIsMobileNavOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <MaintenanceBanner />
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsMobileNavOpen(true)}
            className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)] lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <LogoBadge platform />
            <span className="truncate text-sm font-semibold text-[var(--color-text)]">Platform console</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-4">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[var(--color-bg-subtle)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">
          <PageOutlet />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

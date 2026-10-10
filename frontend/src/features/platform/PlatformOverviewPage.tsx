import { motion } from "framer-motion";
import { Ban, Clock, Plus, School as SchoolIcon, ShieldCheck, UserCheck, Users } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatCard, type StatTone } from "@/features/dashboard/StatCard";
import type { ApiError } from "@/lib/api-client";

import { usePlatformStats } from "./usePlatformCrud";

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export function PlatformOverviewPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = usePlatformStats();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !data) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Failed to load platform stats."}</Alert>;
  }

  const stats: Array<{ key: string; icon: typeof SchoolIcon; label: string; value: number; tone?: StatTone }> = [
    { key: "total", icon: SchoolIcon, label: "Total schools", value: data.schools_total },
    { key: "active", icon: UserCheck, label: "Active schools", value: data.schools_by_status.active, tone: "success" },
    { key: "pending", icon: Clock, label: "Pending schools", value: data.schools_by_status.pending, tone: "warning" },
    { key: "suspended", icon: Ban, label: "Suspended schools", value: data.schools_by_status.suspended, tone: "danger" },
    { key: "users", icon: Users, label: "School users", value: data.school_users_total },
    { key: "admins", icon: ShieldCheck, label: "Platform admins", value: data.platform_admins_total },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform overview"
        description="A snapshot of every school on the platform."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/platform/schools")}>
              <SchoolIcon className="size-4" aria-hidden="true" />
              All schools
            </Button>
            <Button onClick={() => navigate("/platform/schools/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Add school
            </Button>
          </>
        }
      />

      <motion.div
        variants={gridVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
      >
        {stats.map(({ key, ...statProps }) => (
          <motion.div key={key} variants={cardVariants}>
            <StatCard {...statProps} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

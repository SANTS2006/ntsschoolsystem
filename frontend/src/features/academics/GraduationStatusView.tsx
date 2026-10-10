import { Award, GraduationCap } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import type { GraduationStatus, PromotionStatus } from "./types";

const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  promoted: "PROMOTED",
  repeated: "FAILED — REPEAT",
  public_exam_required: "PUBLIC EXAMINATION REQUIRED",
};

const PROMOTION_STATUS_TONE: Record<PromotionStatus, BadgeTone> = {
  promoted: "success",
  repeated: "danger",
  public_exam_required: "warning",
};

export function GraduationStatusView({ status }: { status: GraduationStatus }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4" aria-hidden="true" />
            Graduation status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-[var(--color-text)]">
            Current class: <span className="font-medium">{status.current_class_name ?? "—"}</span>
          </p>
          {status.has_graduated ? (
            <Badge tone="success" className="w-fit">
              <Award className="size-3.5" aria-hidden="true" />
              Graduated{status.graduated_at ? ` — ${new Date(status.graduated_at).toLocaleDateString()}` : ""}
            </Badge>
          ) : status.is_in_graduation_level ? (
            <Badge tone="warning" className="w-fit">
              In final (graduation-level) class — not yet graduated
            </Badge>
          ) : (
            <Badge tone="neutral" className="w-fit">
              Not yet in a graduation-level class
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academic history</CardTitle>
        </CardHeader>
        <CardContent>
          {status.history.length === 0 ? (
            <EmptyState title="No promotion history yet" />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Year</TableHeaderCell>
                    <TableHeaderCell>Class</TableHeaderCell>
                    <TableHeaderCell>Overall %</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>New class / year</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {status.history.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.previous_academic_year_name}</TableCell>
                      <TableCell>{record.previous_class_name}</TableCell>
                      <TableCell>{record.overall_percent ?? "—"}</TableCell>
                      <TableCell>
                        <Badge tone={PROMOTION_STATUS_TONE[record.status]}>
                          {PROMOTION_STATUS_LABEL[record.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.new_class_name ?? "—"}
                        {record.new_academic_year_name ? ` / ${record.new_academic_year_name}` : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

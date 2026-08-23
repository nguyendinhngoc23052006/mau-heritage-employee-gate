import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useT } from "../../lib/i18n";
import { listSlotsForShifts } from "../../services/shiftSlots";
import { listShifts } from "../../services/shifts";
import type { Shift } from "../../types/database";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, LoadingState } from "../ui/EmptyState";

interface CoverageGapsCardProps {
  storeId: string;
}

export function CoverageGapsCard({ storeId }: CoverageGapsCardProps) {
  const t = useT();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["coverage-gaps", storeId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const oneDayLater = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const shifts = await listShifts(storeId, { from: now, to: oneDayLater });
      if (shifts.length === 0) return [];

      const slots = await listSlotsForShifts(shifts.map((s) => s.id));

      // Compute filled/total for each shift
      const shiftCoverage = new Map<
        string,
        { total: number; filled: number; shift: Shift }
      >();
      shifts.forEach((s) => {
        shiftCoverage.set(s.id, { total: 0, filled: 0, shift: s });
      });
      slots.forEach((slot) => {
        const cov = shiftCoverage.get(slot.shift_id);
        if (cov) {
          cov.total++;
          if (slot.claimed_by) cov.filled++;
        }
      });

      // Filter to gaps
      return Array.from(shiftCoverage.values())
        .filter((c) => c.filled < c.total)
        .sort((a, b) => a.shift.starts_at.localeCompare(b.shift.starts_at));
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.coverage_gaps")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const gaps = data ?? [];

  return (
    <Card>
      <CardTitle>{t("dashboard.coverage_gaps")}</CardTitle>
      {gaps.length === 0 ? (
        <EmptyState>{t("dashboard.coverage_full")}</EmptyState>
      ) : (
        <div className="mt-4 space-y-2">
          {gaps.map((gap) => (
            <div
              key={gap.shift.id}
              className="border-b border-slate-100 pb-2 last:border-0 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {new Date(gap.shift.starts_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-xs text-slate-600">
                  {gap.filled}/{gap.total} filled · {gap.shift.notes || "—"}
                </div>
              </div>
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => navigate(`/store/${storeId}/schedule`)}
              >
                {t("common.view")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

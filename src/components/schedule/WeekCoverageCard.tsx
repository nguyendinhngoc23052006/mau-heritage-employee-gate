import { useT } from "../../lib/i18n";
import type { Shift, ShiftSlot } from "../../types/database";
import { Card } from "../ui/Card";

const TZ = "Asia/Ho_Chi_Minh";

function localDayNumber(iso: string): number {
  return Number.parseInt(
    new Date(iso).toLocaleDateString("en-CA", {
      timeZone: TZ,
      day: "2-digit",
    }),
    10,
  );
}

function localDayOfWeek(iso: string): number {
  const weekday = new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function localDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
}

interface WeekCoverageCardProps {
  weekStart: string;
  shifts: Shift[];
  slots: ShiftSlot[];
  onSelectDay: (date: string) => void;
}

export function WeekCoverageCard({
  weekStart,
  shifts,
  slots,
  onSelectDay,
}: WeekCoverageCardProps) {
  const t = useT();

  const dayLabels = [
    t("schedule.bulk_day_sun"),
    t("schedule.bulk_day_mon"),
    t("schedule.bulk_day_tue"),
    t("schedule.bulk_day_wed"),
    t("schedule.bulk_day_thu"),
    t("schedule.bulk_day_fri"),
    t("schedule.bulk_day_sat"),
  ];

  // Build a map of shifts by date
  const shiftsByDate = new Map<string, Shift[]>();
  shifts.forEach((shift) => {
    const dateStr = localDateStr(shift.starts_at);
    const existing = shiftsByDate.get(dateStr);
    if (existing) {
      existing.push(shift);
    } else {
      shiftsByDate.set(dateStr, [shift]);
    }
  });

  // Build a map of slots by shift id
  const slotsByShift = new Map<string, ShiftSlot[]>();
  slots.forEach((slot) => {
    const existing = slotsByShift.get(slot.shift_id);
    if (existing) {
      existing.push(slot);
    } else {
      slotsByShift.set(slot.shift_id, [slot]);
    }
  });

  // Calculate coverage for each day of the week
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T12:00:00+07:00`);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d.toISOString());
    const shiftList = shiftsByDate.get(dateStr) || [];

    let total = 0;
    let filled = 0;
    shiftList.forEach((shift) => {
      const shiftSlots = slotsByShift.get(shift.id) || [];
      total += shiftSlots.length || shift.slot_count;
      filled += shiftSlots.filter((s) => s.claimed_by).length;
    });

    const coveragePercent = total > 0 ? Math.round((filled / total) * 100) : 0;
    const badge =
      coveragePercent >= 100
        ? "green"
        : coveragePercent >= 50
          ? "amber"
          : "red";

    return {
      dateStr,
      dayOfWeek: localDayOfWeek(d.toISOString()),
      dayNumber: localDayNumber(d.toISOString()),
      filled,
      total,
      coveragePercent,
      badge,
    };
  });

  return (
    <Card className="p-4 mb-4">
      <h3 className="text-sm font-semibold text-brand-ink mb-3">
        {t("schedule.week_coverage_title")}
      </h3>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <button
            key={day.dateStr}
            onClick={() => onSelectDay(day.dateStr)}
            type="button"
            className="flex flex-col items-center p-2 rounded-md border border-brand-hairline hover:bg-brand-cream-light transition-colors"
          >
            <span className="text-xs uppercase text-brand-muted mb-1">
              {dayLabels[day.dayOfWeek]}
            </span>
            <span className="text-sm font-bold text-brand-ink mb-1">
              {day.dayNumber}
            </span>
            <span
              className={[
                "inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold",
                day.badge === "green"
                  ? "bg-green-100 text-green-700"
                  : day.badge === "amber"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700",
              ].join(" ")}
            >
              {day.filled}/{day.total}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

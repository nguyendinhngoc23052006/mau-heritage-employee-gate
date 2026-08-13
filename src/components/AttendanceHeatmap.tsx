import { useQuery } from "@tanstack/react-query";
import { useT } from "../lib/i18n";
import { computeAttendanceHeatmap } from "../services/heatmap";
import { ErrorState, LoadingState } from "./ui/EmptyState";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL_WIDTH = 20;
const CELL_HEIGHT = 20;
const PADDING = 40;

interface Props {
  storeId: string;
  from: string;
  to: string;
}

export function AttendanceHeatmap({ storeId, from, to }: Props) {
  const t = useT();

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance-heatmap", storeId, from, to],
    queryFn: () => computeAttendanceHeatmap(storeId, { from, to }),
  });

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Error loading heatmap"
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const { dayHourCounts, totalPerDay } = data;

  // Find max for scaling opacity
  const maxCount = Math.max(
    ...Object.values(dayHourCounts).flatMap((hours) => Object.values(hours)),
  );
  const maxDayCount = Math.max(...Object.values(totalPerDay), 1);

  const getOpacity = (count: number, max: number) => {
    if (max === 0) return 0;
    const ratio = count / max;
    return Math.min(0.1 + ratio * 0.9, 1);
  };

  const svgWidth = PADDING + HOURS.length * CELL_WIDTH + 80;
  const svgHeight = PADDING + 7 * CELL_HEIGHT + 40;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          height={200}
          className="bg-white"
        >
          <title>Attendance heatmap by day and hour</title>
          {/* Y-axis: Days */}
          {DAYS.map((day, i) => (
            <text
              key={day}
              x={PADDING - 10}
              y={PADDING + i * CELL_HEIGHT + CELL_HEIGHT / 2 + 4}
              fontSize={12}
              textAnchor="end"
              fill="#6b7280"
            >
              {day}
            </text>
          ))}

          {/* X-axis: Hours */}
          {HOURS.map((hour) => (
            <text
              key={hour}
              x={PADDING + hour * CELL_WIDTH + CELL_WIDTH / 2}
              y={PADDING - 10}
              fontSize={10}
              textAnchor="middle"
              fill="#6b7280"
            >
              {hour}
            </text>
          ))}

          {/* Heatmap cells */}
          {DAYS.map((_, dayIdx) =>
            HOURS.map((hour) => {
              const count = dayHourCounts[dayIdx]?.[hour] ?? 0;
              const opacity = getOpacity(count, maxCount);
              return (
                <rect
                  key={`cell-${dayIdx}-${hour}`}
                  x={PADDING + hour * CELL_WIDTH}
                  y={PADDING + dayIdx * CELL_HEIGHT}
                  width={CELL_WIDTH - 2}
                  height={CELL_HEIGHT - 2}
                  fill="#3b82f6"
                  opacity={opacity}
                  stroke="#d1d5db"
                  strokeWidth="0.5"
                >
                  <title>{`${DAYS[dayIdx]} ${hour}:00 - ${count} events`}</title>
                </rect>
              );
            }),
          )}

          {/* Day totals legend on the right */}
          {DAYS.map((_day, i) => {
            const count = totalPerDay[i] ?? 0;
            const opacity = getOpacity(count, maxDayCount);
            const barWidth = Math.max(30, (count / maxDayCount) * 60);
            return (
              <g key={`day-total-${_day}`}>
                <rect
                  x={PADDING + HOURS.length * CELL_WIDTH + 10}
                  y={PADDING + i * CELL_HEIGHT}
                  width={barWidth}
                  height={CELL_HEIGHT - 2}
                  fill="#10b981"
                  opacity={opacity}
                  stroke="#d1d5db"
                  strokeWidth="0.5"
                />
                <text
                  x={PADDING + HOURS.length * CELL_WIDTH + 10 + barWidth + 5}
                  y={PADDING + i * CELL_HEIGHT + CELL_HEIGHT / 2 + 3}
                  fontSize={11}
                  fill="#4b5563"
                >
                  {count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4"
            style={{ backgroundColor: "#3b82f6", opacity: 0.2 }}
          />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4"
            style={{ backgroundColor: "#3b82f6", opacity: 0.6 }}
          />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4"
            style={{ backgroundColor: "#3b82f6", opacity: 1 }}
          />
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

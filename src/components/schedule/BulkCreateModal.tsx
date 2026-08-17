import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "../../lib/i18n";
import {
  listPayMultipliers,
  upsertPayMultiplier,
} from "../../services/payMultipliers";
import {
  type BulkShiftInput,
  createShiftsBulk,
} from "../../services/shiftSlots";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { Input, Label } from "../ui/Input";

interface Template {
  start: string;
  end: string;
  slots: number;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSuccess: () => void;
}

function getNextMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  return nextMonday.toISOString().split("T")[0];
}

function getSunday(fromDate: string): string {
  const monday = new Date(fromDate);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday.toISOString().split("T")[0];
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function BulkCreateModal({ open, onClose, storeId, onSuccess }: Props) {
  const t = useT();
  const monday = getNextMonday();
  const sunday = getSunday(monday);

  const [fromDate, setFromDate] = useState(monday);
  const [toDate, setToDate] = useState(sunday);
  const [dayFlags, setDayFlags] = useState([
    false,
    true,
    true,
    true,
    true,
    true,
    false,
  ]); // Sun, Mon, Tue, Wed, Thu, Fri, Sat
  const [templates, setTemplates] = useState<Template[]>([
    { start: "08:00", end: "14:00", slots: 2, notes: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [applyMultiplier, setApplyMultiplier] = useState(false);
  const [multiplierValue, setMultiplierValue] = useState(2);
  const [multiplierReason, setMultiplierReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const shifts: BulkShiftInput[] = [];
      const uniqueDates = new Set<string>();
      const current = new Date(fromDate);
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);

      while (current < end) {
        const dayOfWeek = current.getDay();
        if (dayFlags[dayOfWeek]) {
          const dateStr = current.toISOString().split("T")[0];
          uniqueDates.add(dateStr);
          for (const template of templates) {
            const startsAt = `${dateStr}T${template.start}:00+07:00`;
            const endsAt = `${dateStr}T${template.end}:00+07:00`;
            shifts.push({
              starts_at: startsAt,
              ends_at: endsAt,
              notes: template.notes || undefined,
              slot_count: template.slots,
              claim_open: false,
            });
          }
        }
        current.setDate(current.getDate() + 1);
      }

      await createShiftsBulk(storeId, shifts);

      // Apply multipliers if checked
      if (applyMultiplier && multiplierValue > 0) {
        try {
          const existingMultipliers = await listPayMultipliers(storeId);
          const existingDates = new Set(
            existingMultipliers.map((m) => m.date.split("T")[0]),
          );

          const multiplierUpserts = Array.from(uniqueDates)
            .filter((date) => !existingDates.has(date))
            .map((date) =>
              upsertPayMultiplier({
                storeId: storeId,
                date: `${date}T00:00:00+07:00`,
                multiplier: multiplierValue,
                reason: multiplierReason || undefined,
              }),
            );

          await Promise.allSettled(multiplierUpserts);
        } catch (multiplierErr) {
          // Log but don't throw - shifts are already created
          console.error("Failed to apply multipliers:", multiplierErr);
        }
      }
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      setError(errorMessage(err));
    },
  });

  const daysInRange =
    Math.floor(
      (new Date(toDate).getTime() - new Date(fromDate).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  const selectedDaysCount = dayFlags.filter(Boolean).length;
  const shiftsCount = daysInRange * selectedDaysCount * templates.length;
  const slotsCount =
    shiftsCount * templates.reduce((sum, t) => sum + t.slots, 0);

  const dayLabels = [
    t("schedule.bulk_day_sun"),
    t("schedule.bulk_day_mon"),
    t("schedule.bulk_day_tue"),
    t("schedule.bulk_day_wed"),
    t("schedule.bulk_day_thu"),
    t("schedule.bulk_day_fri"),
    t("schedule.bulk_day_sat"),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("schedule.bulk_create_title")}
      footer={
        <div className="flex gap-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || templates.length === 0}
            variant="primary"
          >
            {t("schedule.bulk_publish")}
          </Button>
          <Button onClick={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="from-date">{t("schedule.bulk_from_date")}</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to-date">{t("schedule.bulk_to_date")}</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>{t("schedule.bulk_days_of_week")}</Label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {dayLabels.map((label, idx) => (
              <label key={idx} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dayFlags[idx]}
                  onChange={(e) => {
                    const newFlags = [...dayFlags];
                    newFlags[idx] = e.target.checked;
                    setDayFlags(newFlags);
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>{t("schedule.bulk_templates")}</Label>
          <div className="space-y-3 mt-2">
            {templates.map((template, idx) => (
              <div
                key={idx}
                className="border border-slate-200 rounded p-3 space-y-2"
              >
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label htmlFor={`start-${idx}`}>Start</Label>
                    <Input
                      id={`start-${idx}`}
                      type="time"
                      value={template.start}
                      onChange={(e) => {
                        const newTemplates = [...templates];
                        newTemplates[idx].start = e.target.value;
                        setTemplates(newTemplates);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`end-${idx}`}>End</Label>
                    <Input
                      id={`end-${idx}`}
                      type="time"
                      value={template.end}
                      onChange={(e) => {
                        const newTemplates = [...templates];
                        newTemplates[idx].end = e.target.value;
                        setTemplates(newTemplates);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`slots-${idx}`}>Slots</Label>
                    <Input
                      id={`slots-${idx}`}
                      type="number"
                      min="1"
                      max="20"
                      value={template.slots}
                      onChange={(e) => {
                        const newTemplates = [...templates];
                        newTemplates[idx].slots = Math.max(
                          1,
                          Number.parseInt(e.target.value) || 1,
                        );
                        setTemplates(newTemplates);
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => {
                        const newTemplates = templates.filter(
                          (_, i) => i !== idx,
                        );
                        setTemplates(
                          newTemplates.length > 0 ? newTemplates : templates,
                        );
                      }}
                      disabled={templates.length === 1}
                      variant="secondary"
                      className="w-full text-xs"
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor={`notes-${idx}`}>Notes</Label>
                  <Input
                    id={`notes-${idx}`}
                    type="text"
                    value={template.notes}
                    onChange={(e) => {
                      const newTemplates = [...templates];
                      newTemplates[idx].notes = e.target.value;
                      setTemplates(newTemplates);
                    }}
                    placeholder={t("common.optional")}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            onClick={() =>
              setTemplates([
                ...templates,
                { start: "08:00", end: "14:00", slots: 2, notes: "" },
              ])
            }
            variant="secondary"
            className="w-full mt-3"
          >
            {t("schedule.bulk_template_add")}
          </Button>
        </div>

        <div className="bg-slate-100 p-3 rounded text-sm">
          {t("schedule.bulk_preview_count", {
            shifts: shiftsCount,
            slots: slotsCount,
          })}
        </div>

        <div>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={applyMultiplier}
              onChange={(checked) => setApplyMultiplier(checked)}
            />
            <span className="text-sm">
              {t("schedule.bulk_multiplier_check")}
            </span>
          </label>

          {applyMultiplier && (
            <div className="mt-3 space-y-3 ml-6 p-3 bg-slate-50 rounded border border-slate-200">
              <div>
                <Label htmlFor="multiplier-value">
                  {t("settings.multipliers.multiplier")}
                </Label>
                <Input
                  id="multiplier-value"
                  type="number"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={multiplierValue}
                  onChange={(e) =>
                    setMultiplierValue(
                      Math.max(0.5, Number.parseFloat(e.target.value) || 2),
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="multiplier-reason">
                  {t("settings.multipliers.reason")}
                </Label>
                <Input
                  id="multiplier-reason"
                  type="text"
                  value={multiplierReason}
                  onChange={(e) => setMultiplierReason(e.target.value)}
                  placeholder={t("settings.multipliers.reason_placeholder")}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

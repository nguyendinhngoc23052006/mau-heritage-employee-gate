import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
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
  slots: string; // string so the input can be temporarily empty while typing
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

function parseSlots(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 20) return null;
  return n;
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
    { start: "08:00", end: "14:00", slots: "2", notes: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [applyMultiplier, setApplyMultiplier] = useState(false);
  const [multiplierValue, setMultiplierValue] = useState("2");
  const [multiplierReason, setMultiplierReason] = useState("");

  const { selectedDatesInRange, previewShifts, previewSlots } = useMemo(() => {
    const dates: string[] = [];
    if (fromDate && toDate && new Date(fromDate) <= new Date(toDate)) {
      const current = new Date(fromDate);
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      while (current < end) {
        if (dayFlags[current.getDay()]) {
          dates.push(current.toISOString().split("T")[0]);
        }
        current.setDate(current.getDate() + 1);
      }
    }
    const templatesSlotsSum = templates.reduce((sum, tpl) => {
      const n = parseSlots(tpl.slots);
      return sum + (n ?? 0);
    }, 0);
    return {
      selectedDatesInRange: dates,
      previewShifts: dates.length * templates.length,
      previewSlots: dates.length * templatesSlotsSum,
    };
  }, [fromDate, toDate, dayFlags, templates]);

  const templatesValid = templates.every((tpl) => {
    if (parseSlots(tpl.slots) === null) return false;
    if (!tpl.start || !tpl.end) return false;
    if (tpl.start >= tpl.end) return false;
    return true;
  });
  const multiplierValid = !applyMultiplier || Number.parseFloat(multiplierValue) > 0;
  const canPublish =
    templates.length > 0 &&
    templatesValid &&
    multiplierValid &&
    previewShifts > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const shifts: BulkShiftInput[] = [];
      for (const dateStr of selectedDatesInRange) {
        for (const template of templates) {
          const slotCount = parseSlots(template.slots);
          if (slotCount === null) continue;
          shifts.push({
            starts_at: `${dateStr}T${template.start}:00+07:00`,
            ends_at: `${dateStr}T${template.end}:00+07:00`,
            notes: template.notes || undefined,
            slot_count: slotCount,
            claim_open: false,
          });
        }
      }

      await createShiftsBulk(storeId, shifts);

      if (applyMultiplier && Number.parseFloat(multiplierValue) > 0) {
        try {
          const existingMultipliers = await listPayMultipliers(storeId);
          const existingDates = new Set(
            existingMultipliers.map((m) => m.date.split("T")[0]),
          );
          const targets = selectedDatesInRange.filter(
            (d) => !existingDates.has(d),
          );
          await Promise.allSettled(
            targets.map((date) =>
              upsertPayMultiplier({
                storeId: storeId,
                date: `${date}T00:00:00+07:00`,
                multiplier: Number.parseFloat(multiplierValue),
                reason: multiplierReason || undefined,
              }),
            ),
          );
        } catch (multiplierErr) {
          console.error("Failed to apply multipliers:", multiplierErr);
        }
      }
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, t("common.error_generic")));
    },
  });

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
          <Button onClick={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canPublish}
            variant="primary"
          >
            {mutation.isPending
              ? t("common.loading")
              : t("schedule.bulk_publish")}
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
              // biome-ignore lint/a11y/noLabelWithoutControl: label wraps the input
              <label key={label} className="flex items-center gap-2">
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
          <Label>{t("schedule.bulk_templates_label")}</Label>
          <p className="text-xs text-brand-muted mt-1 mb-2">
            {t("schedule.bulk_templates_hint")}
          </p>
          <div className="space-y-3 mt-2">
            {templates.map((template, idx) => {
              const slotsInvalid = parseSlots(template.slots) === null;
              const timeInvalid =
                !template.start ||
                !template.end ||
                template.start >= template.end;
              return (
                <div
                  key={`tpl-${idx}`}
                  className="border border-brand-hairline rounded p-3 space-y-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor={`start-${idx}`}>
                        {t("schedule.bulk_template_start")}
                      </Label>
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
                      <Label htmlFor={`end-${idx}`}>
                        {t("schedule.bulk_template_end")}
                      </Label>
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
                      <Label htmlFor={`slots-${idx}`}>
                        {t("schedule.bulk_template_slots")}
                      </Label>
                      <Input
                        id={`slots-${idx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={template.slots}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          const newTemplates = [...templates];
                          newTemplates[idx].slots = raw;
                          setTemplates(newTemplates);
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`notes-${idx}`}>
                      {t("schedule.bulk_template_notes")}
                    </Label>
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
                  {(slotsInvalid || timeInvalid) && (
                    <p className="text-xs text-red-600">
                      {slotsInvalid
                        ? t("schedule.bulk_slots_invalid")
                        : t("schedule.bulk_time_invalid")}
                    </p>
                  )}
                  {templates.length > 1 && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() =>
                          setTemplates(templates.filter((_, i) => i !== idx))
                        }
                        variant="ghost"
                        className="text-xs"
                      >
                        {t("schedule.bulk_template_remove")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            onClick={() =>
              setTemplates([
                ...templates,
                { start: "14:00", end: "22:00", slots: "2", notes: "" },
              ])
            }
            variant="secondary"
            className="w-full mt-3"
          >
            {t("schedule.bulk_template_add")}
          </Button>
        </div>

        <div className="bg-brand-cream-light p-3 rounded text-sm text-brand-ink">
          {t("schedule.bulk_preview_count", {
            shifts: previewShifts,
            slots: previewSlots,
          })}
        </div>

        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox */}
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
            <div className="mt-3 space-y-3 ml-6 p-3 bg-brand-cream-light rounded border border-brand-hairline">
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
                  onChange={(e) => setMultiplierValue(e.target.value)}
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

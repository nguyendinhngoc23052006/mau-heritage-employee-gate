import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BulkCreateModal } from "../components/schedule/BulkCreateModal";
import { SlotGrid } from "../components/schedule/SlotGrid";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import { Dialog } from "../components/ui/Dialog";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import { listPayMultipliers } from "../services/payMultipliers";
import {
  claimSlot,
  listSlotsForShifts,
  releaseSlot,
  setShiftClaimOpen,
  setStoreClaimOpen,
} from "../services/shiftSlots";
import {
  approveSwap,
  createShift,
  declineSwap,
  listPendingSwaps,
  listShifts,
  requestShiftSwap,
} from "../services/shifts";
import type { Shift, ShiftSlot } from "../types/database";

const TZ = "Asia/Ho_Chi_Minh";

function localDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
}

function localTimeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localDayNumber(iso: string): number {
  return Number.parseInt(
    new Date(iso).toLocaleDateString("en-CA", {
      timeZone: TZ,
      day: "2-digit",
    }),
    10,
  );
}

function localMonthShort(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: TZ,
    month: "short",
  });
}

// 0=Sunday, 1=Monday, ..., 6=Saturday — in Saigon TZ
function localDayOfWeek(iso: string): number {
  const weekday = new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

// Monday of the week containing the given local date (YYYY-MM-DD)
function mondayOf(dateStr: string): string {
  const noon = new Date(`${dateStr}T12:00:00+07:00`);
  const dow = localDayOfWeek(noon.toISOString());
  // Monday = 1; distance back to Monday
  const distance = (dow + 6) % 7;
  const monday = new Date(noon);
  monday.setDate(monday.getDate() - distance);
  return localDateStr(monday.toISOString());
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return localDateStr(d.toISOString());
}

function todayISO(): string {
  return localDateStr(new Date().toISOString());
}

export function SchedulePage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const role = useRoleOn(storeId);
  const queryClient = useQueryClient();

  const [weekStart, setWeekStart] = useState<string>(() =>
    mondayOf(todayISO()),
  );
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const today = todayISO();
    const monday = mondayOf(today);
    const sunday = addDaysISO(monday, 6);
    return today >= monday && today <= sunday ? today : monday;
  });

  const [showNewForm, setShowNewForm] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [swapDialogShiftId, setSwapDialogShiftId] = useState<string | null>(
    null,
  );
  const [selectedSwapUserId, setSelectedSwapUserId] = useState("");
  const [formData, setFormData] = useState({
    starts_at: "",
    ends_at: "",
    notes: "",
  });

  const weekEnd = useMemo(() => addDaysISO(weekStart, 6), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)),
    [weekStart],
  );
  const fromDateISO = `${weekStart}T00:00:00+07:00`;
  const toDateISO = `${addDaysISO(weekEnd, 1)}T00:00:00+07:00`;

  const ready = Boolean(storeId);
  const isManager = isManagerRole(role);

  const {
    data: shifts,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["shifts", storeId, weekStart, weekEnd],
    enabled: ready,
    queryFn: () =>
      listShifts(storeId as string, { from: fromDateISO, to: toDateISO }),
  });

  const { data: multipliers } = useQuery({
    queryKey: ["pay_multipliers", storeId, weekStart, weekEnd],
    enabled: ready,
    queryFn: () => listPayMultipliers(storeId as string, weekStart, weekEnd),
  });

  const { data: slots } = useQuery({
    queryKey: ["shift_slots", storeId, weekStart, weekEnd],
    enabled: ready && Boolean(shifts?.length),
    queryFn: () => {
      if (!shifts || shifts.length === 0) return [];
      return listSlotsForShifts(shifts.map((s) => s.id));
    },
  });

  const { data: pendingSwaps } = useQuery({
    queryKey: ["shift_swaps", storeId],
    enabled: ready && isManager,
    queryFn: () => listPendingSwaps(storeId as string),
  });

  const { data: members } = useQuery({
    queryKey: ["members", storeId],
    enabled: ready,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error: err } = await supabase
        .from("memberships")
        .select("user_id, store_id")
        .eq("store_id", storeId)
        .eq("active", true);
      if (err) throw err;
      const rows = (data ?? []) as { user_id: string }[];
      const ids = rows.map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: profs, error: perr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      if (perr) throw perr;
      const nameById = new Map<string, string>();
      (profs ?? []).forEach((p: { id: string; display_name: string | null }) =>
        nameById.set(p.id, p.display_name ?? p.id.substring(0, 8)),
      );
      return ids.map((id) => ({
        id,
        name: nameById.get(id) ?? id.substring(0, 8),
      }));
    },
  });

  const memberNames = useMemo(() => {
    const m: Record<string, string> = {};
    (members ?? []).forEach((mem) => {
      m[mem.id] = mem.name;
    });
    return m;
  }, [members]);

  const shiftsByDay = useMemo(() => {
    const g: Record<string, Shift[]> = {};
    (shifts ?? []).forEach((s) => {
      const d = localDateStr(s.starts_at);
      if (!g[d]) g[d] = [];
      g[d].push(s);
    });
    Object.keys(g).forEach((d) => {
      g[d].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    });
    return g;
  }, [shifts]);

  const slotsByShift = useMemo(() => {
    const g: Record<string, ShiftSlot[]> = {};
    (slots ?? []).forEach((sl) => {
      if (!g[sl.shift_id]) g[sl.shift_id] = [];
      g[sl.shift_id].push(sl);
    });
    return g;
  }, [slots]);

  const multiplierByDate = useMemo(() => {
    const m: Record<string, { multiplier: number; reason: string | null }> = {};
    (multipliers ?? []).forEach((mp) => {
      const d = mp.date.split("T")[0];
      m[d] = { multiplier: mp.multiplier, reason: mp.reason };
    });
    return m;
  }, [multipliers]);

  const claimSlotMutation = useMutation({
    mutationFn: (slotId: string) => claimSlot(slotId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["shift_slots", storeId, weekStart, weekEnd],
      }),
  });

  const releaseSlotMutation = useMutation({
    mutationFn: (slotId: string) => releaseSlot(slotId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["shift_slots", storeId, weekStart, weekEnd],
      }),
  });

  const setShiftClaimOpenMutation = useMutation({
    mutationFn: (params: { shiftId: string; open: boolean }) =>
      setShiftClaimOpen(params.shiftId, params.open),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["shifts", storeId, weekStart, weekEnd],
      }),
  });

  const setStoreClaimOpenMutation = useMutation({
    mutationFn: () => setStoreClaimOpen(storeId as string, true),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["shifts", storeId, weekStart, weekEnd],
      }),
  });

  const swapMutation = useMutation({
    mutationFn: () => {
      if (!swapDialogShiftId || !selectedSwapUserId)
        throw new Error("Missing data");
      return requestShiftSwap({
        shiftId: swapDialogShiftId,
        toUserId: selectedSwapUserId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift_swaps", storeId] });
      setSwapDialogShiftId(null);
      setSelectedSwapUserId("");
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!storeId) throw new Error("no store");
      return createShift({
        store_id: storeId,
        starts_at: formData.starts_at,
        ends_at: formData.ends_at,
        notes: formData.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["shifts", storeId, weekStart, weekEnd],
      });
      setFormData({ starts_at: "", ends_at: "", notes: "" });
      setShowNewForm(false);
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`shifts:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shifts",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [storeId, queryClient]);

  if (!storeId)
    return (
      <ErrorState message={t("common.error", { message: "Store not found" })} />
    );
  if (error)
    return (
      <ErrorState message={t("common.error", { message: String(error) })} />
    );
  if (isLoading) return <LoadingState>{t("common.loading")}</LoadingState>;

  const today = todayISO();
  const selectedDayShifts = shiftsByDay[selectedDay] ?? [];
  const selectedMultiplier = multiplierByDate[selectedDay];

  const dayShortLabels = [
    t("schedule.bulk_day_sun"),
    t("schedule.bulk_day_mon"),
    t("schedule.bulk_day_tue"),
    t("schedule.bulk_day_wed"),
    t("schedule.bulk_day_thu"),
    t("schedule.bulk_day_fri"),
    t("schedule.bulk_day_sat"),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold font-display text-brand-ink">
          {t("schedule.title")}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <>
              <Button
                onClick={() => setBulkModalOpen(true)}
                variant="primary"
                className="text-xs sm:text-sm"
              >
                {t("schedule.bulk_create_button")}
              </Button>
              <Button
                onClick={() => setStoreClaimOpenMutation.mutate()}
                variant="secondary"
                className="text-xs sm:text-sm"
                disabled={setStoreClaimOpenMutation.isPending}
              >
                {t("schedule.open_all_this_week")}
              </Button>
              <Button
                onClick={() => setShowNewForm(!showNewForm)}
                variant="ghost"
                className="text-xs sm:text-sm"
              >
                {t("schedule.new_shift")}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button
            onClick={() => {
              const prev = addDaysISO(weekStart, -7);
              setWeekStart(prev);
              setSelectedDay(prev);
            }}
            variant="ghost"
            className="text-sm px-2"
            aria-label={t("schedule.week_prev")}
          >
            ‹
          </Button>
          <div className="text-center">
            <div className="text-sm font-semibold text-brand-ink">
              {localDayNumber(`${weekStart}T12:00:00+07:00`)}{" "}
              {localMonthShort(`${weekStart}T12:00:00+07:00`)} —{" "}
              {localDayNumber(`${weekEnd}T12:00:00+07:00`)}{" "}
              {localMonthShort(`${weekEnd}T12:00:00+07:00`)}
            </div>
            <button
              type="button"
              onClick={() => {
                const t = todayISO();
                setWeekStart(mondayOf(t));
                setSelectedDay(t);
              }}
              className="text-xs text-brand-muted hover:text-brand-navy underline"
            >
              {t("schedule.week_today")}
            </button>
          </div>
          <Button
            onClick={() => {
              const next = addDaysISO(weekStart, 7);
              setWeekStart(next);
              setSelectedDay(next);
            }}
            variant="ghost"
            className="text-sm px-2"
            aria-label={t("schedule.week_next")}
          >
            ›
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const dow = localDayOfWeek(`${day}T12:00:00+07:00`);
            const count = (shiftsByDay[day] ?? []).length;
            const isSelected = day === selectedDay;
            const isToday = day === today;
            const dayMult = multiplierByDate[day];
            return (
              <button
                type="button"
                key={day}
                onClick={() => setSelectedDay(day)}
                className={[
                  "flex flex-col items-center justify-center rounded-md py-2 px-1 text-xs transition-colors",
                  isSelected
                    ? "bg-brand-navy text-brand-cream"
                    : isToday
                      ? "bg-brand-cream-light text-brand-ink ring-1 ring-brand-navy"
                      : "bg-white text-brand-ink hover:bg-brand-cream-light border border-brand-hairline",
                ].join(" ")}
              >
                <span className="text-[10px] uppercase tracking-wide">
                  {dayShortLabels[dow]}
                </span>
                <span className="text-base font-bold leading-tight">
                  {localDayNumber(`${day}T12:00:00+07:00`)}
                </span>
                <span className="mt-1 flex items-center gap-0.5 text-[10px]">
                  {count > 0 ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {count}
                    </>
                  ) : (
                    <span className="opacity-30">·</span>
                  )}
                </span>
                {dayMult && (
                  <span
                    className={[
                      "mt-1 rounded px-1 text-[9px] font-bold leading-tight",
                      isSelected
                        ? "bg-brand-cream text-brand-navy"
                        : "bg-brand-navy text-brand-cream",
                    ].join(" ")}
                  >
                    ×{dayMult.multiplier}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {isManager && pendingSwaps && pendingSwaps.length > 0 && (
        <PendingSwapsSection
          swaps={pendingSwaps}
          onApprove={(id) =>
            approveSwap(id).then(() => {
              queryClient.invalidateQueries({
                queryKey: ["shifts", storeId],
              });
              queryClient.invalidateQueries({
                queryKey: ["shift_swaps", storeId],
              });
            })
          }
          onDecline={(id) =>
            declineSwap(id).then(() => {
              queryClient.invalidateQueries({
                queryKey: ["shift_swaps", storeId],
              });
            })
          }
        />
      )}

      {showNewForm && isManager && (
        <NewShiftForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={() => createMutation.mutate()}
          isLoading={createMutation.isPending}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display font-bold text-lg text-brand-ink">
            {new Date(`${selectedDay}T12:00:00+07:00`).toLocaleDateString(
              "vi-VN",
              { timeZone: TZ, weekday: "long", day: "numeric", month: "long" },
            )}
          </h2>
          <span className="text-xs text-brand-muted">
            {t("schedule.day_shift_count", { n: selectedDayShifts.length })}
          </span>
        </div>
        {selectedMultiplier && (
          <div className="mb-3 rounded-md bg-brand-cream-light border border-brand-hairline p-2 text-xs text-brand-ink">
            <strong>
              ×{selectedMultiplier.multiplier}{" "}
              {t("schedule.multiplier_badge_short")}
            </strong>
            {selectedMultiplier.reason
              ? ` — ${selectedMultiplier.reason}`
              : null}
          </div>
        )}
        {selectedDayShifts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-brand-hairline p-8 text-center text-sm text-brand-muted">
            {t("schedule.day_empty_shifts")}
          </div>
        ) : (
          <div className="space-y-3">
            {selectedDayShifts.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                shiftSlots={slotsByShift[shift.id] ?? []}
                isManager={isManager}
                memberNames={memberNames}
                currentUserId={user?.id}
                onClaimSlot={(slotId) => claimSlotMutation.mutate(slotId)}
                onReleaseSlot={(slotId) => releaseSlotMutation.mutate(slotId)}
                onSetClaimOpen={(open) =>
                  setShiftClaimOpenMutation.mutate({
                    shiftId: shift.id,
                    open,
                  })
                }
                onRequestSwap={() => setSwapDialogShiftId(shift.id)}
                claimingSlotId={claimSlotMutation.variables}
              />
            ))}
          </div>
        )}
      </div>

      {swapDialogShiftId && (
        <SwapRequestDialog
          open={true}
          storeId={storeId as string}
          selectedUserId={selectedSwapUserId}
          onSelectedUserChange={setSelectedSwapUserId}
          onSubmit={() => swapMutation.mutate()}
          onClose={() => {
            setSwapDialogShiftId(null);
            setSelectedSwapUserId("");
          }}
          isLoading={swapMutation.isPending}
        />
      )}

      <BulkCreateModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        storeId={storeId}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ["shifts", storeId, weekStart, weekEnd],
          });
        }}
      />
    </div>
  );
}

interface ShiftCardProps {
  shift: Shift;
  shiftSlots: ShiftSlot[];
  isManager: boolean;
  memberNames: Record<string, string>;
  currentUserId?: string;
  onClaimSlot: (slotId: string) => void;
  onReleaseSlot: (slotId: string) => void;
  onSetClaimOpen: (open: boolean) => void;
  onRequestSwap: () => void;
  claimingSlotId?: string;
}

function ShiftCard({
  shift,
  shiftSlots,
  isManager,
  memberNames,
  currentUserId,
  onClaimSlot,
  onReleaseSlot,
  onSetClaimOpen,
  onRequestSwap,
  claimingSlotId,
}: ShiftCardProps) {
  const t = useT();
  const filled = shiftSlots.filter((s) => s.claimed_by).length;
  const total = shiftSlots.length || shift.slot_count;
  const mineHere = shiftSlots.some((s) => s.claimed_by === currentUserId);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-base font-semibold text-brand-ink">
              {localTimeStr(shift.starts_at)} – {localTimeStr(shift.ends_at)}
            </div>
            <span className="text-xs text-brand-muted">
              {t("schedule.slot_fill_indicator", { filled, total })}
            </span>
          </div>
          {shift.notes && (
            <div className="text-xs text-brand-muted mt-1">{shift.notes}</div>
          )}
        </div>
        {mineHere && !isManager && (
          <Button
            onClick={onRequestSwap}
            variant="ghost"
            className="text-xs shrink-0"
          >
            {t("swap.request_button")}
          </Button>
        )}
      </div>

      <div className="mb-3">
        <SlotGrid
          slots={shiftSlots}
          shiftClaimOpen={shift.claim_open}
          currentUserId={currentUserId || null}
          memberNames={memberNames}
          onClaim={onClaimSlot}
          onRelease={onReleaseSlot}
          claimingSlotId={claimingSlotId}
        />
      </div>

      {isManager && (
        <div className="border-t border-brand-hairline pt-3 flex items-center justify-between">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={shift.claim_open}
              onChange={(checked) => onSetClaimOpen(checked)}
            />
            <span>{t("schedule.claim_open_toggle")}</span>
          </label>
        </div>
      )}
    </Card>
  );
}

interface NewShiftFormData {
  starts_at: string;
  ends_at: string;
  notes: string;
}

function NewShiftForm({
  formData,
  setFormData,
  onSubmit,
  isLoading,
  onCancel,
}: {
  formData: NewShiftFormData;
  setFormData: (data: NewShiftFormData) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <Card className="mb-4">
      <div className="space-y-4">
        <div>
          <Label htmlFor="starts_at">{t("schedule.bulk_template_start")}</Label>
          <Input
            id="starts_at"
            type="datetime-local"
            value={formData.starts_at}
            onChange={(e) =>
              setFormData({ ...formData, starts_at: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="ends_at">{t("schedule.bulk_template_end")}</Label>
          <Input
            id="ends_at"
            type="datetime-local"
            value={formData.ends_at}
            onChange={(e) =>
              setFormData({ ...formData, ends_at: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="notes">{t("schedule.bulk_template_notes")}</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            rows={2}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={isLoading} variant="primary">
            {t("common.save")}
          </Button>
          <Button onClick={onCancel} variant="secondary">
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SwapRequestDialog({
  open,
  storeId,
  selectedUserId,
  onSelectedUserChange,
  onSubmit,
  onClose,
  isLoading,
}: {
  open: boolean;
  storeId: string;
  selectedUserId: string;
  onSelectedUserChange: (id: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const t = useT();
  const { data: members } = useQuery({
    queryKey: ["members_options", storeId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("store_id", storeId)
        .eq("active", true);
      if (error) throw error;
      const ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return [] as { value: string; label: string }[];
      const { data: profs, error: perr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      if (perr) throw perr;
      const nameById = new Map<string, string>();
      (profs ?? []).forEach((p: { id: string; display_name: string | null }) =>
        nameById.set(p.id, p.display_name ?? p.id.substring(0, 8)),
      );
      return ids.map((id) => ({
        value: id,
        label: nameById.get(id) ?? id.substring(0, 8),
      }));
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("swap.request_title")}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isLoading || !selectedUserId}
            variant="primary"
          >
            {t("common.confirm")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="swap-user">{t("rules.apply.select_employee")}</Label>
          <Select
            id="swap-user"
            value={selectedUserId}
            onChange={onSelectedUserChange}
            options={members ?? []}
            placeholder={t("common.select_placeholder")}
          />
        </div>
      </div>
    </Dialog>
  );
}

interface SwapRow {
  id: string;
  from_user_name: string | null;
  to_user_name: string | null;
}

function PendingSwapsSection({
  swaps,
  onApprove,
  onDecline,
}: {
  swaps: SwapRow[];
  onApprove: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  return (
    <Card>
      <CardTitle>{t("swap.approve_title")}</CardTitle>
      <div className="space-y-3 mt-4">
        {swaps.map((swap) => (
          <div
            key={swap.id}
            className="border-t border-brand-hairline pt-3 first:border-0 first:pt-0"
          >
            <div className="text-sm text-brand-ink mb-3">
              <span className="font-medium">
                {swap.from_user_name || "Unknown"}
              </span>
              {" → "}
              <span className="font-medium">
                {swap.to_user_name || "Unknown"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setApprovingId(swap.id);
                  onApprove(swap.id)
                    .catch(console.error)
                    .finally(() => setApprovingId(null));
                }}
                disabled={approvingId === swap.id || decliningId === swap.id}
                variant="primary"
                className="flex-1 text-xs"
              >
                {t("swap.approve_button")}
              </Button>
              <Button
                onClick={() => {
                  setDecliningId(swap.id);
                  onDecline(swap.id)
                    .catch(console.error)
                    .finally(() => setDecliningId(null));
                }}
                disabled={approvingId === swap.id || decliningId === swap.id}
                variant="secondary"
                className="flex-1 text-xs"
              >
                {t("swap.decline_button")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BulkCreateModal } from "../components/schedule/BulkCreateModal";
import { SlotGrid } from "../components/schedule/SlotGrid";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import { Dialog } from "../components/ui/Dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SchedulePage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const role = useRoleOn(storeId);
  const queryClient = useQueryClient();

  const [showNewForm, setShowNewForm] = useState(false);
  const [swapDialogShiftId, setSwapDialogShiftId] = useState<string | null>(
    null,
  );
  const [selectedSwapUserId, setSelectedSwapUserId] = useState("");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    starts_at: "",
    ends_at: "",
    notes: "",
  });

  const ready = Boolean(storeId);

  // Calculate date range
  const getDateRange = () => {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const dateRange = getDateRange();
  const fromDateISO = dateRange.from;
  const toDateISO = dateRange.to;

  const {
    data: shifts,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["shifts", storeId],
    enabled: ready,
    queryFn: () => {
      return listShifts(storeId as string, {
        from: fromDateISO,
        to: toDateISO,
      });
    },
  });

  const { data: multipliers } = useQuery({
    queryKey: ["pay_multipliers", storeId, fromDateISO, toDateISO],
    enabled: ready,
    queryFn: () =>
      listPayMultipliers(storeId as string, fromDateISO, toDateISO),
  });

  const { data: slots } = useQuery({
    queryKey: ["shift_slots", storeId],
    enabled: ready && Boolean(shifts?.length),
    queryFn: () => {
      if (!shifts || shifts.length === 0) return [];
      return listSlotsForShifts(shifts.map((s) => s.id));
    },
  });

  const { data: pendingSwaps } = useQuery({
    queryKey: ["shift_swaps", storeId],
    enabled: ready && isManagerRole(role),
    queryFn: () => listPendingSwaps(storeId as string),
  });

  const { data: members } = useQuery({
    queryKey: ["members", storeId],
    enabled: ready,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, user:profiles(display_name)")
        .eq("store_id", storeId)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.user_id,
        name: m.user?.display_name || m.user_id.substring(0, 8),
      }));
    },
  });

  const memberNames: Record<string, string> = {};
  if (members) {
    members.forEach((m) => {
      memberNames[m.id] = m.name;
    });
  }

  const slotsByShift: Record<string, ShiftSlot[]> = {};
  if (slots) {
    slots.forEach((slot) => {
      if (!slotsByShift[slot.shift_id]) {
        slotsByShift[slot.shift_id] = [];
      }
      slotsByShift[slot.shift_id].push(slot);
    });
  }

  const multiplierByDate: Record<
    string,
    { multiplier: number; reason: string | null }
  > = {};
  if (multipliers) {
    multipliers.forEach((m) => {
      const dateStr = m.date.split("T")[0];
      multiplierByDate[dateStr] = {
        multiplier: m.multiplier,
        reason: m.reason,
      };
    });
  }

  const claimSlotMutation = useMutation({
    mutationFn: (slotId: string) => claimSlot(slotId),
    onSuccess: () => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["shift_slots", storeId] });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not open")) {
        // Toast or error handling can go here
      }
    },
  });

  const releaseSlotMutation = useMutation({
    mutationFn: (slotId: string) => releaseSlot(slotId),
    onSuccess: () => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["shift_slots", storeId] });
      }
    },
  });

  const setShiftClaimOpenMutation = useMutation({
    mutationFn: (params: { shiftId: string; open: boolean }) =>
      setShiftClaimOpen(params.shiftId, params.open),
    onSuccess: () => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      }
    },
  });

  const setStoreClaimOpenMutation = useMutation({
    mutationFn: () => setStoreClaimOpen(storeId as string, true),
    onSuccess: () => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      }
    },
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
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
        queryClient.invalidateQueries({ queryKey: ["shift_swaps", storeId] });
      }
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
      if (storeId)
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
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

  const isManager = isManagerRole(role);
  const empty = !shifts || shifts.length === 0;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-brand-ink">
          {t("schedule.title")}
        </h1>
        <div className="flex gap-2">
          {isManager && (
            <>
              <Button onClick={() => setBulkModalOpen(true)} variant="primary">
                {t("schedule.bulk_create")}
              </Button>
              <Button
                onClick={() => setStoreClaimOpenMutation.mutate()}
                variant="secondary"
              >
                {t("schedule.open_all_this_week")}
              </Button>
            </>
          )}
          {isManager && (
            <Button
              onClick={() => setShowNewForm(!showNewForm)}
              variant="primary"
            >
              {t("schedule.new_shift")}
            </Button>
          )}
        </div>
      </div>

      {isManager && pendingSwaps && pendingSwaps.length > 0 && (
        <PendingSwapsSection
          swaps={pendingSwaps}
          onApprove={(id) => {
            return approveSwap(id).then(() => {
              if (storeId) {
                queryClient.invalidateQueries({
                  queryKey: ["shifts", storeId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["shift_swaps", storeId],
                });
              }
            });
          }}
          onDecline={(id) => {
            return declineSwap(id).then(() => {
              if (storeId) {
                queryClient.invalidateQueries({
                  queryKey: ["shift_swaps", storeId],
                });
              }
            });
          }}
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

      {empty ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
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
                setShiftClaimOpenMutation.mutate({ shiftId: shift.id, open })
              }
              claimingSlotId={claimSlotMutation.variables}
              multiplierByDate={multiplierByDate}
            />
          ))}
        </div>
      )}

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
          if (storeId) {
            queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
          }
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
  claimingSlotId?: string;
  multiplierByDate: Record<
    string,
    { multiplier: number; reason: string | null }
  >;
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
  claimingSlotId,
  multiplierByDate,
}: ShiftCardProps) {
  const t = useT();

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">
              {formatDate(shift.starts_at)} – {formatDate(shift.ends_at)}
            </div>
            {(() => {
              const date = shift.starts_at.split("T")[0];
              const m = multiplierByDate[date];
              if (!m) return null;
              return (
                <span className="ml-2 rounded-full bg-brand-navy px-2 py-0.5 text-xs font-semibold text-brand-cream">
                  {t("schedule.multiplier_badge", { multiplier: m.multiplier })}
                </span>
              );
            })()}
          </div>
          {shift.notes && (
            <div className="text-xs text-slate-500 mt-1">{shift.notes}</div>
          )}
        </div>
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
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
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
          <Label htmlFor="starts_at">Start time</Label>
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
          <Label htmlFor="ends_at">End time</Label>
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
          <Label htmlFor="notes">Notes</Label>
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
    queryKey: ["members", storeId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, user:profiles(display_name)")
        .eq("store_id", storeId)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        value: m.user_id,
        label: m.user?.display_name || m.user_id.substring(0, 8),
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
          <Button
            onClick={onSubmit}
            disabled={isLoading || !selectedUserId}
            variant="primary"
          >
            {t("common.confirm")}
          </Button>
          <Button onClick={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="swap-user">Employee</Label>
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

function PendingSwapsSection({
  swaps,
  onApprove,
  onDecline,
}: {
  swaps: any[];
  onApprove: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  return (
    <Card className="mb-6">
      <CardTitle>{t("swap.approve_title")}</CardTitle>
      <div className="space-y-3 mt-4">
        {swaps.map((swap) => (
          <div
            key={swap.id}
            className="border-t border-slate-200 pt-3 first:border-0 first:pt-0"
          >
            <div className="text-sm text-slate-600 mb-3">
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
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
import {
  approveSwap,
  claimShift,
  createShift,
  declineSwap,
  listPendingSwaps,
  listShifts,
  requestShiftSwap,
} from "../services/shifts";
import type { Shift } from "../types/database";

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
  const [formData, setFormData] = useState({
    starts_at: "",
    ends_at: "",
    notes: "",
  });

  const ready = Boolean(storeId);

  const {
    data: shifts,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["shifts", storeId],
    enabled: ready,
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);
      return listShifts(storeId as string, {
        from: from.toISOString(),
        to: to.toISOString(),
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (shiftId: string) => claimShift(shiftId),
    onSuccess: (result) => {
      if (result && storeId) {
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

  const { data: pendingSwaps } = useQuery({
    queryKey: ["shift_swaps", storeId],
    enabled: ready && isManagerRole(role),
    queryFn: () => listPendingSwaps(storeId as string),
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

  // Realtime subscription — proper effect so it runs once per storeId and
  // gets torn down on unmount / storeId change. The prior render-body call
  // created a fresh channel every re-render, whose second .subscribe() blew
  // up with "cannot add postgres_changes callbacks after subscribe()".
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
        <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
        {isManager && (
          <Button
            onClick={() => setShowNewForm(!showNewForm)}
            variant="primary"
          >
            {t("schedule.new_shift")}
          </Button>
        )}
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
        <div className="space-y-2">
          {shifts.map((shift) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              onClaim={() => claimMutation.mutate(shift.id)}
              currentUserId={user?.id}
              onRequestSwap={() => setSwapDialogShiftId(shift.id)}
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
    </div>
  );
}

function ShiftRow({
  shift,
  onClaim,
  currentUserId,
  onRequestSwap,
}: {
  shift: Shift;
  onClaim: () => void;
  currentUserId?: string;
  onRequestSwap: () => void;
}) {
  const t = useT();
  const isClaimedByMe = shift.claimed_by === currentUserId;

  return (
    <Card className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-sm font-semibold">
          {formatDate(shift.starts_at)} – {formatDate(shift.ends_at)}
        </div>
        {shift.notes && (
          <div className="text-xs text-slate-500">{shift.notes}</div>
        )}
        <div className="mt-1 text-xs text-slate-600">
          {shift.status === "open"
            ? t("schedule.open")
            : shift.status === "claimed"
              ? t("schedule.claimed_by", { name: "Someone" })
              : "Cancelled"}
        </div>
      </div>
      <div className="ml-4 flex gap-2">
        {shift.status === "open" && (
          <Button onClick={onClaim} variant="primary">
            {t("schedule.claim")}
          </Button>
        )}
        {isClaimedByMe && shift.status === "claimed" && (
          <Button onClick={onRequestSwap} variant="secondary">
            {t("swap.request_button")}
          </Button>
        )}
      </div>
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

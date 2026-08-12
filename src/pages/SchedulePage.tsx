import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n";
import { useRoleOn, isManagerRole } from "../hooks/useMemberships";
import { getSupabase } from "../lib/supabaseClient";
import { listShifts, createShift, claimShift } from "../services/shifts";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Label } from "../components/ui/Input";
import { LoadingState, ErrorState, EmptyState } from "../components/ui/EmptyState";
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
  const role = useRoleOn(storeId);
  const queryClient = useQueryClient();

  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({ starts_at: "", ends_at: "", notes: "" });

  if (!storeId) return <ErrorState message={t("common.error", { message: "Store not found" })} />;

  const { data: shifts, isLoading, error } = useQuery({
    queryKey: ["shifts", storeId],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);
      return listShifts(storeId, {
        from: from.toISOString(),
        to: to.toISOString(),
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (shiftId: string) => claimShift(shiftId),
    onSuccess: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createShift({
        store_id: storeId,
        starts_at: formData.starts_at,
        ends_at: formData.ends_at,
        notes: formData.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      setFormData({ starts_at: "", ends_at: "", notes: "" });
      setShowNewForm(false);
    },
  });

  // Realtime subscription
  useRealtime(storeId, queryClient);

  if (error) return <ErrorState message={t("common.error", { message: String(error) })} />;
  if (isLoading) return <LoadingState>{t("common.loading")}</LoadingState>;
  if (!shifts || shifts.length === 0)
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
          {isManagerRole(role) && (
            <Button onClick={() => setShowNewForm(!showNewForm)} variant="primary">
              {t("schedule.new_shift")}
            </Button>
          )}
        </div>
        {showNewForm && isManagerRole(role) && (
          <NewShiftForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={() => createMutation.mutate()}
            isLoading={createMutation.isPending}
            onCancel={() => setShowNewForm(false)}
          />
        )}
        <EmptyState>{t("common.empty")}</EmptyState>
      </div>
    );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
        {isManagerRole(role) && (
          <Button onClick={() => setShowNewForm(!showNewForm)} variant="primary">
            {t("schedule.new_shift")}
          </Button>
        )}
      </div>

      {showNewForm && isManagerRole(role) && (
        <NewShiftForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={() => createMutation.mutate()}
          isLoading={createMutation.isPending}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      <div className="space-y-2">
        {shifts.map((shift) => (
          <ShiftRow key={shift.id} shift={shift} onClaim={() => claimMutation.mutate(shift.id)} />
        ))}
      </div>
    </div>
  );
}

function ShiftRow({
  shift,
  onClaim,
}: {
  shift: Shift;
  onClaim: () => void;
}) {
  const t = useT();

  return (
    <Card className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-sm font-semibold">
          {formatDate(shift.starts_at)} – {formatDate(shift.ends_at)}
        </div>
        {shift.notes && <div className="text-xs text-slate-500">{shift.notes}</div>}
        <div className="mt-1 text-xs text-slate-600">
          {shift.status === "open"
            ? t("schedule.open")
            : shift.status === "claimed"
              ? t("schedule.claimed_by", { name: "Someone" })
              : "Cancelled"}
        </div>
      </div>
      {shift.status === "open" && (
        <Button onClick={onClaim} variant="primary" className="ml-4">
          {t("schedule.claim")}
        </Button>
      )}
    </Card>
  );
}

function NewShiftForm({
  formData,
  setFormData,
  onSubmit,
  isLoading,
  onCancel,
}: {
  formData: { starts_at: string; ends_at: string; notes: string };
  setFormData: (data: any) => void;
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
            onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="ends_at">End time</Label>
          <Input
            id="ends_at"
            type="datetime-local"
            value={formData.ends_at}
            onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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

function useRealtime(
  storeId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const supabase = getSupabase();

  // Subscribe to shift changes and invalidate on any change
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
}

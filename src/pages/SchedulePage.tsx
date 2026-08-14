import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import { claimShift, createShift, listShifts } from "../services/shifts";
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
            />
          ))}
        </div>
      )}
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
      {shift.status === "open" && (
        <Button onClick={onClaim} variant="primary" className="ml-4">
          {t("schedule.claim")}
        </Button>
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

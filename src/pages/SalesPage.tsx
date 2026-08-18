import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { MySalesHistoryCard } from "../components/sales/MySalesHistoryCard";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { formatVnd, parseVndToCents } from "../lib/money";
import {
  approveSales,
  disputeSales,
  listPendingSales,
  submitSales,
} from "../services/sales";
import { getStore } from "../services/stores";
import type { SalesReport } from "../types/database";

export function SalesPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);

  // No hooks below this line, so an early return here is hook-order-safe.
  if (!storeId || !user)
    return (
      <ErrorState
        message={t("common.error", { message: "Not authenticated" })}
      />
    );

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold font-display text-brand-ink">
        {t("sales.title")}
      </h1>

      <div className="space-y-6">
        <MySalesHistoryCard userId={user.id} storeId={storeId} />
        <SubmitSalesForm userId={user.id} storeId={storeId} />
        {isManager && <PendingReviews storeId={storeId} />}
      </div>
    </div>
  );
}

function SubmitSalesForm({
  userId,
  storeId,
}: { userId: string; storeId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [qr, setQr] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const cashCents = parseVndToCents(cash) ?? 0;
      const cardCents = parseVndToCents(card) ?? 0;
      const qrCents = parseVndToCents(qr) ?? 0;
      const expectedCents = parseVndToCents(expected);

      return submitSales({
        store_id: storeId,
        cash_cents: cashCents,
        card_cents: cardCents,
        qr_cents: qrCents,
        expected_cents: expectedCents ?? undefined,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sales", "mine", userId, storeId],
      });
      setCash("");
      setCard("");
      setQr("");
      setExpected("");
      setNote("");
    },
  });

  const cashCents = parseVndToCents(cash) ?? 0;
  const cardCents = parseVndToCents(card) ?? 0;
  const qrCents = parseVndToCents(qr) ?? 0;
  const totalCents = cashCents + cardCents + qrCents;

  return (
    <Card>
      <CardTitle>{t("sales.submit")}</CardTitle>
      <div className="space-y-4">
        <div>
          <Label htmlFor="cash">{t("sales.cash")}</Label>
          <Input
            id="cash"
            type="text"
            inputMode="numeric"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="card">{t("sales.card")}</Label>
          <Input
            id="card"
            type="text"
            inputMode="numeric"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="qr">{t("sales.qr")}</Label>
          <Input
            id="qr"
            type="text"
            inputMode="numeric"
            value={qr}
            onChange={(e) => setQr(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="rounded-md bg-slate-100 p-3 text-sm font-semibold">
          {t("common.save")}: {formatVnd(totalCents)}
        </div>
        <div>
          <Label htmlFor="expected">{t("sales.expected")}</Label>
          <Input
            id="expected"
            type="text"
            inputMode="numeric"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="note">{t("sales.note")}</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t("sales.note")}
          />
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || totalCents === 0}
          variant="primary"
          className="w-full"
        >
          {t("sales.submit")}
        </Button>
      </div>
    </Card>
  );
}

function PendingReviews({ storeId }: { storeId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const {
    data: pending,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["sales", "pending", storeId],
    queryFn: () => listPendingSales(storeId),
  });
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => getStore(storeId),
  });
  const thresholdPct = store?.variance_threshold_pct ?? 5;

  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveSales(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sales", "pending", storeId],
      });
      setConfirmId(null);
    },
  });

  const disputeMutation = useMutation({
    mutationFn: () =>
      disputeId ? disputeSales(disputeId, disputeReason) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sales", "pending", storeId],
      });
      setDisputeId(null);
      setDisputeReason("");
    },
  });

  if (error)
    return (
      <ErrorState message={t("common.error", { message: String(error) })} />
    );
  if (isLoading) return <LoadingState>{t("common.loading")}</LoadingState>;
  if (!pending || pending.length === 0)
    return (
      <Card>
        <CardTitle>{t("sales.pending_queue")}</CardTitle>
        <EmptyState>{t("common.empty")}</EmptyState>
      </Card>
    );

  const requestApprove = (report: SalesReport) => {
    const total = report.cash_cents + report.card_cents + report.qr_cents;
    const variance = Math.abs(report.variance_cents);
    // Confirm when variance ratio hits threshold, OR when total is zero with any
    // variance (a zero-total report with an expected > 0 must not bypass review).
    const hits = total > 0 ? (variance / total) * 100 >= thresholdPct : variance > 0;
    if (hits) {
      setConfirmId(report.id);
    } else {
      approveMutation.mutate(report.id);
    }
  };

  const confirmReport = pending.find((r) => r.id === confirmId) ?? null;

  return (
    <Card>
      <CardTitle>{t("sales.pending_queue")}</CardTitle>
      <div className="space-y-3">
        {pending.map((report) => (
          <div
            key={report.id}
            className="border-t border-slate-200 pt-3 first:border-0 first:pt-0"
          >
            <PendingSalesRow
              report={report}
              onApprove={() => requestApprove(report)}
              onDispute={() => setDisputeId(report.id)}
              isApproving={approveMutation.isPending}
            />
            {disputeId === report.id && (
              <DisputeForm
                onSubmit={() => disputeMutation.mutate()}
                reason={disputeReason}
                onReasonChange={setDisputeReason}
                isLoading={disputeMutation.isPending}
                onCancel={() => setDisputeId(null)}
              />
            )}
          </div>
        ))}
      </div>
      <Dialog
        open={confirmReport !== null}
        onClose={() => setConfirmId(null)}
        title={t("sales.large_variance_title")}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                confirmReport && approveMutation.mutate(confirmReport.id)
              }
              disabled={approveMutation.isPending}
            >
              {t("sales.large_variance_confirm")}
            </Button>
          </div>
        }
      >
        {confirmReport && (
          <p>
            {t("sales.large_variance_body", {
              amount: formatVnd(confirmReport.variance_cents),
              pct: thresholdPct,
            })}
          </p>
        )}
      </Dialog>
    </Card>
  );
}

function PendingSalesRow({
  report,
  onApprove,
  onDispute,
  isApproving,
}: {
  report: SalesReport & { submitter_display_name?: string | null };
  onApprove: () => void;
  onDispute: () => void;
  isApproving: boolean;
}) {
  const t = useT();
  const totalCents = report.cash_cents + report.card_cents + report.qr_cents;

  return (
    <div className="space-y-2">
      {report.submitter_display_name && (
        <div className="text-xs font-medium text-slate-700">
          {t("sales.review_by", { name: report.submitter_display_name })}
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{formatVnd(totalCents)}</span>
        <span className="text-slate-500">
          {new Date(report.submitted_at).toLocaleDateString("vi-VN")}
        </span>
      </div>
      <div className="text-xs text-slate-600">
        {t("sales.cash")}: {formatVnd(report.cash_cents)} | {t("sales.card")}:{" "}
        {formatVnd(report.card_cents)} | {t("sales.qr")}:{" "}
        {formatVnd(report.qr_cents)}
      </div>
      {report.variance_cents !== 0 && (
        <div className="text-xs font-semibold text-yellow-700">
          {t("sales.variance", { amount: formatVnd(report.variance_cents) })}
        </div>
      )}
      {report.note && (
        <div className="text-xs text-slate-600">Note: {report.note}</div>
      )}
      <div className="flex gap-2">
        <Button
          onClick={onApprove}
          disabled={isApproving}
          variant="primary"
          className="flex-1 text-xs"
        >
          {t("sales.approve")}
        </Button>
        <Button
          onClick={onDispute}
          variant="secondary"
          className="flex-1 text-xs"
        >
          {t("sales.dispute")}
        </Button>
      </div>
    </div>
  );
}

function DisputeForm({
  onSubmit,
  reason,
  onReasonChange,
  isLoading,
  onCancel,
}: {
  onSubmit: () => void;
  reason: string;
  onReasonChange: (r: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <Textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={t("sales.dispute_reason")}
        rows={2}
      />
      <div className="flex gap-2">
        <Button
          onClick={onSubmit}
          disabled={isLoading || !reason.trim()}
          variant="primary"
          className="flex-1 text-xs"
        >
          {t("common.confirm")}
        </Button>
        <Button
          onClick={onCancel}
          variant="secondary"
          className="flex-1 text-xs"
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

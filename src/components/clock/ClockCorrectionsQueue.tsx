import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import {
  listPendingCorrectionRequests,
  resolveClockCorrection,
} from "../../services/clockCorrections";
import { listMembers } from "../../services/members";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../ui/EmptyState";
import { Input, Label } from "../ui/Input";

interface ClockCorrectionsQueueProps {
  storeId: string;
}

export function ClockCorrectionsQueue({ storeId }: ClockCorrectionsQueueProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});

  const {
    data: requests,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pending-corrections", storeId],
    queryFn: () => listPendingCorrectionRequests(storeId),
  });

  const { data: members } = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => listMembers(storeId),
  });

  const resolveMutation = useMutation({
    mutationFn: async (params: {
      requestId: string;
      decision: "approved" | "denied";
    }) => {
      const note = resolveNotes[params.requestId];
      return resolveClockCorrection({
        requestId: params.requestId,
        decision: params.decision,
        note: note && note.trim().length > 0 ? note : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pending-corrections", storeId],
      });
      setExpandedId(null);
      setResolveNotes({});
    },
  });

  if (error) {
    return (
      <Card>
        <ErrorState message={errorMessage(error, t("common.error_generic"))} />
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <Card>
        <EmptyState>{t("clock.corrections_queue_empty")}</EmptyState>
      </Card>
    );
  }

  function getMemberName(userId: string): string {
    return (
      members?.find((m) => m.user_id === userId)?.profile?.display_name ||
      userId
    );
  }

  function getKindLabel(kind: string): string {
    const labels: Record<string, string> = {
      missing_in: t("clock.correction_missing_in"),
      missing_out: t("clock.correction_missing_out"),
      wrong_time: t("clock.correction_wrong_time"),
    };
    return labels[kind] || kind;
  }

  return (
    <Card>
      <CardTitle>{t("clock.corrections_queue_title")}</CardTitle>
      <div className="mt-4 space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded border border-slate-200 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-brand-ink">
                  {getMemberName(req.user_id)}
                </p>
                <p className="text-xs text-slate-600">
                  {getKindLabel(req.kind)} •{" "}
                  {format(new Date(req.created_at), "yyyy-MM-dd HH:mm")}
                </p>
                <p className="text-xs text-slate-700 mt-1 line-clamp-2">
                  {req.reason}
                </p>
                {req.proposed_at && (
                  <p className="text-xs text-slate-600 mt-1">
                    {t("clock.correction_proposed_at")}{" "}
                    {format(new Date(req.proposed_at), "yyyy-MM-dd HH:mm")}
                  </p>
                )}
              </div>
            </div>

            {expandedId === req.id && (
              <div className="space-y-2 border-t border-slate-200 pt-2">
                <div>
                  <Label htmlFor={`note-${req.id}`}>
                    {t("clock.correction_review_note_label")}
                  </Label>
                  <Input
                    id={`note-${req.id}`}
                    type="text"
                    value={resolveNotes[req.id] || ""}
                    onChange={(e) =>
                      setResolveNotes({
                        ...resolveNotes,
                        [req.id]: e.target.value,
                      })
                    }
                    placeholder={t("common.optional")}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="px-2 py-1 text-xs"
                    variant="primary"
                    onClick={() =>
                      resolveMutation.mutate({
                        requestId: req.id,
                        decision: "approved",
                      })
                    }
                    disabled={resolveMutation.isPending}
                  >
                    {t("clock.correction_approve")}
                  </Button>
                  <Button
                    className="px-2 py-1 text-xs"
                    variant="danger"
                    onClick={() =>
                      resolveMutation.mutate({
                        requestId: req.id,
                        decision: "denied",
                      })
                    }
                    disabled={resolveMutation.isPending}
                  >
                    {t("clock.correction_deny")}
                  </Button>
                  <Button
                    className="px-2 py-1 text-xs"
                    variant="secondary"
                    onClick={() => setExpandedId(null)}
                    disabled={resolveMutation.isPending}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {expandedId !== req.id && (
              <Button
                className="px-2 py-1 text-xs"
                variant="secondary"
                onClick={() => setExpandedId(req.id)}
              >
                {t("common.review")}
              </Button>
            )}

            {resolveMutation.error && expandedId === req.id && (
              <Alert variant="error" className="text-xs">
                {errorMessage(resolveMutation.error, t("common.error_generic"))}
              </Alert>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

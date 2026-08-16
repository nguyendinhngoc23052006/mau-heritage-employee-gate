import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { listMembers } from "../services/members";
import { applyManualRule, listRules } from "../services/rules";

interface ApplyRulePageProps {
  storeId: string;
}

export function ApplyRulePage({ storeId }: ApplyRulePageProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
  } = useQuery({
    queryKey: ["rules", storeId, "active"],
    queryFn: async () => {
      const allRules = await listRules(storeId);
      return allRules.filter((r) => r.active);
    },
  });

  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
  } = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => listMembers(storeId),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const rule = rules?.find((r) => r.id === selectedRuleId);
      if (!rule || !selectedUserId) throw new Error("Missing rule or user");

      await applyManualRule({
        rule,
        target_user_id: selectedUserId,
        reason: reason || undefined,
      });
    },
    onSuccess: () => {
      const member = members?.find((m) => m.user_id === selectedUserId);
      const displayName = member?.profile?.display_name || "User";

      setSuccessMessage(t("rules.applied", { name: displayName }));
      setSelectedRuleId("");
      setSelectedUserId("");
      setReason("");

      setTimeout(() => setSuccessMessage(""), 3000);

      queryClient.invalidateQueries({ queryKey: ["rules", storeId, "active"] });
    },
  });

  const selectedRule = rules?.find((r) => r.id === selectedRuleId);

  const isLoading = rulesLoading || membersLoading;
  const error = rulesError || membersError;

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Error loading data"}
      />
    );
  }

  if (!rules || rules.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold font-display mb-4">
          {t("rules.apply.title")}
        </h1>
        <EmptyState>{t("common.empty")}</EmptyState>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">
          {t("rules.apply.title")}
        </h1>
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      {applyMutation.error && (
        <Alert variant="error">
          {errorMessage(applyMutation.error, t("common.error_saving"))}
        </Alert>
      )}

      <Card>
        <CardTitle>{t("rules.apply.title")}</CardTitle>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedRuleId || !selectedUserId) return;
            await applyMutation.mutateAsync();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="rule-select">{t("rules.apply.select_rule")}</Label>
            <Select
              id="rule-select"
              value={selectedRuleId}
              onChange={setSelectedRuleId}
              searchable
              options={
                rules?.map((rule) => ({
                  value: rule.id,
                  label: rule.name,
                })) || []
              }
              placeholder={t("rules.apply.select_rule_placeholder")}
            />
          </div>

          {selectedRule && (
            <div className="p-4 bg-slate-100 rounded-md space-y-2 text-sm">
              <div>
                <strong>{t("rules.points")}:</strong>{" "}
                {selectedRule.points_delta}
              </div>
              <div>
                <strong>{t("rules.amount")}:</strong>{" "}
                {selectedRule.amount_cents}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="user-select">
              {t("rules.apply.select_employee")}
            </Label>
            <Select
              id="user-select"
              value={selectedUserId}
              onChange={setSelectedUserId}
              searchable
              options={
                members?.map((member) => ({
                  value: member.user_id,
                  label:
                    member.profile?.display_name ||
                    member.user_id.substring(0, 8),
                })) || []
              }
              placeholder={t("rules.apply.select_employee_placeholder")}
            />
          </div>

          <div>
            <Label htmlFor="reason">{t("rules.apply.reason_label")}</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("rules.apply.reason_placeholder")}
            />
          </div>

          <Button
            type="submit"
            disabled={
              !selectedRuleId || !selectedUserId || applyMutation.isPending
            }
            className="w-full"
          >
            {applyMutation.isPending
              ? t("common.loading")
              : t("rules.apply.button")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

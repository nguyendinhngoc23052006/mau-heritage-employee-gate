import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { createRule, listRules, updateRule } from "../services/rules";
import type { Rule, RuleTrigger } from "../types/database";

interface RulesPageProps {
  storeId: string;
}

type RuleKind = "auto" | "manual";

const UNIMPLEMENTED_AUTO_TRIGGERS = new Set<RuleTrigger>([
  "missed_shift",
  "late_arrival",
  "till_variance",
  "points_threshold",
]);

export function RulesPage({ storeId }: RulesPageProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    kind: RuleKind;
    trigger_type: RuleTrigger;
    points_delta: number;
    amount_cents: number;
    active: boolean;
  }>({
    name: "",
    kind: "manual",
    trigger_type: "manager_manual",
    points_delta: 0,
    amount_cents: 0,
    active: true,
  });

  const {
    data: rules,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["rules", storeId],
    queryFn: () => listRules(storeId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createRule({
        store_id: storeId,
        name: formData.name,
        kind: formData.kind,
        trigger_type: formData.trigger_type,
        points_delta: formData.points_delta,
        amount_cents: formData.amount_cents,
        active: formData.active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules", storeId] });
      setFormData({
        name: "",
        kind: "manual",
        trigger_type: "manager_manual",
        points_delta: 0,
        amount_cents: 0,
        active: true,
      });
      setShowForm(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: Rule) => updateRule(rule.id, { active: !rule.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules", storeId] });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    await createMutation.mutateAsync();
  };

  if (!isManager) {
    return <ErrorState message={t("analytics.access_denied")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Error loading rules"}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center gap-3">
        <h1 className="text-2xl font-bold font-display">{t("rules.title")}</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {t("rules.new_rule")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardTitle>{t("rules.new_rule")}</CardTitle>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="rule-name">{t("rules.name")}</Label>
              <Input
                id="rule-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("rules.name_placeholder")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="rule-kind">{t("rules.kind_label")}</Label>
                <Select
                  id="rule-kind"
                  value={formData.kind}
                  onChange={(v) =>
                    setFormData({
                      ...formData,
                      kind: v as "auto" | "manual",
                    })
                  }
                  options={[
                    { value: "manual", label: t("rules.kind_manual") },
                    { value: "auto", label: t("rules.kind_auto") },
                  ]}
                />
              </div>

              <div>
                <Label htmlFor="rule-trigger">{t("rules.trigger")}</Label>
                <Select
                  id="rule-trigger"
                  value={formData.trigger_type}
                  onChange={(v) =>
                    setFormData({
                      ...formData,
                      trigger_type: v as RuleTrigger,
                    })
                  }
                  options={[
                    {
                      value: "manager_manual",
                      label: t("rules.trigger_manager_manual"),
                    },
                    {
                      value: "missed_shift",
                      label: t("rules.trigger_missed_shift"),
                    },
                    {
                      value: "late_arrival",
                      label: t("rules.trigger_late_arrival"),
                    },
                    {
                      value: "till_variance",
                      label: t("rules.trigger_till_variance"),
                    },
                    {
                      value: "points_threshold",
                      label: t("rules.trigger_points_threshold"),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="points-delta">{t("rules.points")}</Label>
                <Input
                  id="points-delta"
                  type="number"
                  value={formData.points_delta}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      points_delta: Number.parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="amount-cents">{t("rules.amount")}</Label>
                <Input
                  id="amount-cents"
                  type="number"
                  value={formData.amount_cents}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      amount_cents: Number.parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <Checkbox
              id="rule-active"
              checked={formData.active}
              onChange={(v) => setFormData({ ...formData, active: v })}
              label={t("rules.active")}
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || !formData.name.trim()}
              >
                {createMutation.isPending
                  ? t("common.loading")
                  : t("common.save")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {(!rules || rules.length === 0) && !showForm ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left px-4 py-2">{t("rules.name")}</th>
                <th className="text-left px-4 py-2">{t("rules.trigger")}</th>
                <th className="text-left px-4 py-2">{t("rules.points")}</th>
                <th className="text-left px-4 py-2">{t("rules.amount")}</th>
                <th className="text-left px-4 py-2">{t("rules.active")}</th>
                <th className="text-left px-4 py-2">
                  {t("rules.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b hover:bg-brand-cream-light"
                >
                  <td className="px-4 py-2">{rule.name}</td>
                  <td className="px-4 py-2">
                    {rule.trigger_type}
                    {UNIMPLEMENTED_AUTO_TRIGGERS.has(rule.trigger_type) && (
                      <span className="ml-2 rounded bg-brand-cream-light px-1.5 py-0.5 text-[10px] font-medium text-brand-muted">
                        {t("rules.auto_not_implemented")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{rule.points_delta}</td>
                  <td className="px-4 py-2">{formatVnd(rule.amount_cents)}</td>
                  <td className="px-4 py-2">{rule.active ? "✓" : "✗"}</td>
                  <td className="px-4 py-2">
                    <Button
                      variant="secondary"
                      onClick={() => toggleMutation.mutate(rule)}
                      disabled={toggleMutation.isPending}
                      className="text-xs px-2 py-1"
                    >
                      {rule.active
                        ? t("rules.toggle.disable")
                        : t("rules.toggle.enable")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

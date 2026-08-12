import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Card, CardTitle } from "../components/ui/Card";
import { EmptyState, LoadingState, ErrorState } from "../components/ui/EmptyState";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { listRules, createRule, updateRule } from "../services/rules";
import type { Rule, RuleTrigger } from "../types/database";

interface RulesPageProps {
  storeId: string;
}

export function RulesPage({ storeId }: RulesPageProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    kind: "manual" as const,
    trigger_type: "manager_manual" as RuleTrigger,
    points_delta: 0,
    amount_cents: 0,
    active: true,
  });

  const { data: rules, isLoading, error } = useQuery({
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

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return <ErrorState message={error instanceof Error ? error.message : "Error loading rules"} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("rules.title")}</h1>
        <Button onClick={() => setShowForm(!showForm)}>{t("rules.new_rule")}</Button>
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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Late arrival fine"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rule-kind">Kind</Label>
                <select
                  id="rule-kind"
                  value={formData.kind}
                  onChange={(e) => setFormData({ ...formData, kind: e.target.value as "auto" | "manual" })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                </select>
              </div>

              <div>
                <Label htmlFor="rule-trigger">{t("rules.trigger")}</Label>
                <select
                  id="rule-trigger"
                  value={formData.trigger_type}
                  onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value as RuleTrigger })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="manager_manual">Manager Manual</option>
                  <option value="missed_shift">Missed Shift</option>
                  <option value="late_arrival">Late Arrival</option>
                  <option value="till_variance">Till Variance</option>
                  <option value="points_threshold">Points Threshold</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="points-delta">{t("rules.points")}</Label>
                <Input
                  id="points-delta"
                  type="number"
                  value={formData.points_delta}
                  onChange={(e) => setFormData({ ...formData, points_delta: Number.parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label htmlFor="amount-cents">{t("rules.amount")}</Label>
                <Input
                  id="amount-cents"
                  type="number"
                  value={formData.amount_cents}
                  onChange={(e) => setFormData({ ...formData, amount_cents: Number.parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rule-active"
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <Label htmlFor="rule-active">{t("rules.active")}</Label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending || !formData.name.trim()}>
                {createMutation.isPending ? t("common.loading") : t("common.save")}
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
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((rule) => (
                <tr key={rule.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-2">{rule.name}</td>
                  <td className="px-4 py-2">{rule.trigger_type}</td>
                  <td className="px-4 py-2">{rule.points_delta}</td>
                  <td className="px-4 py-2">{formatVnd(rule.amount_cents)}</td>
                  <td className="px-4 py-2">{rule.active ? "✓" : "✗"}</td>
                  <td className="px-4 py-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggleMutation.mutate(rule)}
                      disabled={toggleMutation.isPending}
                    >
                      {rule.active ? "Disable" : "Enable"}
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

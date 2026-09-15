import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card, CardTitle } from "../../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/EmptyState";
import { Input, Label } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useMe } from "../../hooks/useMe";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import {
  createSector,
  listPeople,
  listSectors,
  setRole,
} from "../../services/org";
import type { Profile } from "../../types/database";

function personLabel(p: Profile): string {
  return p.display_name || p.id.substring(0, 8);
}

// Tier 1 and directors land here. Tier 1 shapes the organisation: sectors,
// their directors, and the CEO. A director sees only their own sectors (RLS)
// and no appointment controls — those live one level down, per store.
export function OrgPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useMe();
  const isTier1 = me.tier === 1;
  const isSysadmin = me.profile?.global_role === "sysadmin";

  const sectors = useQuery({
    queryKey: ["sectors"],
    queryFn: listSectors,
    enabled: me.tier !== undefined && me.tier <= 2,
  });
  const people = useQuery({
    queryKey: ["people", "directory"],
    queryFn: listPeople,
    enabled: isTier1,
  });

  const [sectorName, setSectorName] = useState("");
  const [ceoPick, setCeoPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sectors"] });
    queryClient.invalidateQueries({ queryKey: ["people", "directory"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
    queryClient.invalidateQueries({ queryKey: ["org", "chart"] });
  };

  const createSectorMutation = useMutation({
    mutationFn: () => createSector(sectorName),
    onSuccess: () => {
      setSectorName("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e, t("org.error"))),
  });

  const ceoMutation = useMutation({
    mutationFn: (params: { userId: string; role: "ceo" | "none" }) =>
      setRole({
        targetUserId: params.userId,
        scope: "global",
        scopeId: null,
        role: params.role,
      }),
    onSuccess: () => {
      setCeoPick("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e, t("org.error"))),
  });

  if (me.isLoading) return <LoadingState>{t("common.loading")}</LoadingState>;
  if (me.isError || me.tier === undefined)
    return <ErrorState message={t("org.error")} />;
  if (me.tier > 2) return <Navigate to="/onboarding" replace />;
  if (sectors.error)
    return <ErrorState message={errorMessage(sectors.error, t("org.error"))} />;

  const directory = people.data ?? [];
  const leadership = directory.filter((p) => p.global_role);
  const ceo = leadership.find((p) => p.global_role === "ceo");
  const appointable = directory.filter(
    (p) => !p.global_role && p.id !== me.profile?.id,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-brand-ink">
          {t("org.title")}
        </h1>
        <p className="text-sm text-brand-muted">{t(`org.tier_${me.tier}`)}</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {isTier1 && (
        <Card>
          <CardTitle>{t("org.leadership")}</CardTitle>
          {leadership.length === 0 ? (
            <EmptyState>{t("common.empty")}</EmptyState>
          ) : (
            <ul className="divide-y divide-brand-hairline text-sm">
              {leadership.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <span>
                    <span className="font-medium text-brand-ink">
                      {personLabel(p)}
                    </span>{" "}
                    <span className="text-brand-muted">
                      · {t(`people.role_${p.global_role}`)}
                    </span>
                  </span>
                  {isSysadmin && p.global_role === "ceo" && (
                    <Button
                      variant="danger"
                      className="text-xs"
                      disabled={ceoMutation.isPending}
                      onClick={() =>
                        ceoMutation.mutate({ userId: p.id, role: "none" })
                      }
                    >
                      {t("org.remove_ceo")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isSysadmin && !ceo && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Label htmlFor="ceo-pick">{t("org.appoint_ceo")}</Label>
                <Select
                  id="ceo-pick"
                  value={ceoPick}
                  onChange={setCeoPick}
                  options={[
                    { value: "", label: t("org.pick_person") },
                    ...appointable.map((p) => ({
                      value: p.id,
                      label: personLabel(p),
                    })),
                  ]}
                  searchable={appointable.length >= 6}
                  ariaLabel={t("org.appoint_ceo")}
                />
              </div>
              <Button
                disabled={!ceoPick || ceoMutation.isPending}
                onClick={() =>
                  ceoMutation.mutate({ userId: ceoPick, role: "ceo" })
                }
              >
                {t("org.appoint")}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>{t("org.sectors")}</CardTitle>
        {sectors.isLoading ? (
          <LoadingState>{t("common.loading")}</LoadingState>
        ) : (sectors.data ?? []).length === 0 ? (
          <EmptyState>{t("org.no_sectors")}</EmptyState>
        ) : (
          <ul className="divide-y divide-brand-hairline text-sm">
            {(sectors.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="font-medium text-brand-ink">{s.name}</span>
                <Link
                  to={`/org/sector/${s.id}`}
                  className="text-sm font-medium text-brand-navy hover:underline"
                >
                  {t("org.open")}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {isTier1 && (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createSectorMutation.mutate();
            }}
          >
            <div className="min-w-56 flex-1">
              <Label htmlFor="sector-name">{t("org.new_sector")}</Label>
              <Input
                id="sector-name"
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                placeholder={t("org.sector_name_placeholder")}
              />
            </div>
            <Button
              type="submit"
              disabled={!sectorName.trim() || createSectorMutation.isPending}
            >
              {t("org.create")}
            </Button>
          </form>
        )}
      </Card>

      {isTier1 && (
        <Card>
          <CardTitle>{t("org.people")}</CardTitle>
          {people.isLoading ? (
            <LoadingState>{t("common.loading")}</LoadingState>
          ) : directory.length === 0 ? (
            <EmptyState>{t("common.empty")}</EmptyState>
          ) : (
            <ul className="divide-y divide-brand-hairline text-sm">
              {directory.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium text-brand-ink">
                    {personLabel(p)}
                  </span>
                  <span className="text-xs text-brand-muted">
                    {p.global_role
                      ? t(`people.role_${p.global_role}`)
                      : t("org.no_global_role")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-brand-muted">
            {t("org.people_hint")}
          </p>
        </Card>
      )}
    </div>
  );
}

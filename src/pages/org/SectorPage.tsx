import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
  createStoreInSector,
  listPeople,
  listSectorDirectors,
  listSectors,
  listStoresInSector,
  setRole,
} from "../../services/org";
import type { Profile } from "../../types/database";

function personLabel(p: Profile | null | undefined, fallback: string): string {
  return p?.display_name || fallback.substring(0, 8);
}

// One sector: its directors, its stores, and — for whoever oversees it — the
// controls to add a store and to appoint a director or a store manager.
export function SectorPage() {
  const t = useT();
  const { sectorId } = useParams<{ sectorId: string }>();
  const queryClient = useQueryClient();
  const me = useMe();
  const isTier1 = me.tier === 1;
  const oversees =
    isTier1 ||
    (me.tier === 2 && !!sectorId && me.directorOf.includes(sectorId));

  const sectors = useQuery({
    queryKey: ["sectors"],
    queryFn: listSectors,
    enabled: !!sectorId,
  });
  const directors = useQuery({
    queryKey: ["sector-directors", sectorId],
    queryFn: () => listSectorDirectors(sectorId as string),
    enabled: !!sectorId,
  });
  const stores = useQuery({
    queryKey: ["sector-stores", sectorId],
    queryFn: () => listStoresInSector(sectorId as string),
    enabled: !!sectorId,
  });
  // RLS already narrows this to the caller's branch, so a director only ever
  // sees their own people here.
  const people = useQuery({
    queryKey: ["people", "directory"],
    queryFn: listPeople,
    enabled: oversees,
  });

  const [storeName, setStoreName] = useState("");
  const [directorPick, setDirectorPick] = useState("");
  const [managerPick, setManagerPick] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sector-directors", sectorId] });
    queryClient.invalidateQueries({ queryKey: ["sector-stores", sectorId] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
    queryClient.invalidateQueries({ queryKey: ["org", "chart"] });
  };

  const createStoreMutation = useMutation({
    mutationFn: () => createStoreInSector(sectorId as string, storeName),
    onSuccess: () => {
      setStoreName("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e, t("org.error"))),
  });

  const roleMutation = useMutation({
    mutationFn: (params: {
      userId: string;
      scope: "sector" | "store";
      scopeId: string;
      role: "director" | "manager" | "none";
    }) =>
      setRole({
        targetUserId: params.userId,
        scope: params.scope,
        scopeId: params.scopeId,
        role: params.role,
      }),
    onSuccess: () => {
      setDirectorPick("");
      setManagerPick({});
      setError(null);
      invalidate();
    },
    onError: (e) => setError(errorMessage(e, t("org.error"))),
  });

  if (!sectorId) return <Navigate to="/org" replace />;
  if (me.isLoading || sectors.isLoading)
    return <LoadingState>{t("common.loading")}</LoadingState>;
  if (sectors.error)
    return <ErrorState message={errorMessage(sectors.error, t("org.error"))} />;
  const sector = (sectors.data ?? []).find((s) => s.id === sectorId);
  if (!sector) return <ErrorState message={t("org.sector_not_found")} />;

  const directory = people.data ?? [];
  const directorIds = new Set((directors.data ?? []).map((d) => d.user_id));
  // RLS already hides everyone at or above the caller; this only keeps the
  // sector's own directors out of the manager list.
  const candidates = directory.filter(
    (p) => !p.global_role && p.id !== me.profile?.id && !directorIds.has(p.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/org" className="text-sm text-brand-navy hover:underline">
          ← {t("org.title")}
        </Link>
        <h1 className="text-2xl font-bold font-display text-brand-ink">
          {sector.name}
        </h1>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <CardTitle>{t("org.directors")}</CardTitle>
        {directors.isLoading ? (
          <LoadingState>{t("common.loading")}</LoadingState>
        ) : (directors.data ?? []).length === 0 ? (
          <EmptyState>{t("org.no_directors")}</EmptyState>
        ) : (
          <ul className="divide-y divide-brand-hairline text-sm">
            {(directors.data ?? []).map((d) => (
              <li
                key={d.user_id}
                className="flex items-center justify-between py-2"
              >
                <span className="font-medium text-brand-ink">
                  {personLabel(d.profile, d.user_id)}
                </span>
                {isTier1 && (
                  <Button
                    variant="danger"
                    className="text-xs"
                    disabled={roleMutation.isPending}
                    onClick={() =>
                      roleMutation.mutate({
                        userId: d.user_id,
                        scope: "sector",
                        scopeId: sectorId,
                        role: "none",
                      })
                    }
                  >
                    {t("org.remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isTier1 && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Label htmlFor="director-pick">{t("org.appoint_director")}</Label>
              <Select
                id="director-pick"
                value={directorPick}
                onChange={setDirectorPick}
                options={[
                  { value: "", label: t("org.pick_person") },
                  ...candidates.map((p) => ({
                    value: p.id,
                    label: personLabel(p, p.id),
                  })),
                ]}
                searchable={candidates.length >= 6}
                ariaLabel={t("org.appoint_director")}
              />
            </div>
            <Button
              disabled={!directorPick || roleMutation.isPending}
              onClick={() =>
                roleMutation.mutate({
                  userId: directorPick,
                  scope: "sector",
                  scopeId: sectorId,
                  role: "director",
                })
              }
            >
              {t("org.appoint")}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>{t("org.stores")}</CardTitle>
        {stores.isLoading ? (
          <LoadingState>{t("common.loading")}</LoadingState>
        ) : (stores.data ?? []).length === 0 ? (
          <EmptyState>{t("org.no_stores")}</EmptyState>
        ) : (
          <ul className="divide-y divide-brand-hairline text-sm">
            {(stores.data ?? []).map((s) => (
              <li key={s.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-brand-ink">{s.name}</span>
                  <Link
                    to={`/store/${s.id}`}
                    className="text-sm font-medium text-brand-navy hover:underline"
                  >
                    {t("org.open")}
                  </Link>
                </div>
                {oversees && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <Label htmlFor={`manager-${s.id}`}>
                        {t("org.appoint_manager")}
                      </Label>
                      <Select
                        id={`manager-${s.id}`}
                        value={managerPick[s.id] ?? ""}
                        onChange={(v) =>
                          setManagerPick((prev) => ({ ...prev, [s.id]: v }))
                        }
                        options={[
                          { value: "", label: t("org.pick_person") },
                          ...candidates.map((p) => ({
                            value: p.id,
                            label: personLabel(p, p.id),
                          })),
                        ]}
                        searchable={candidates.length >= 6}
                        ariaLabel={t("org.appoint_manager")}
                        className="text-xs"
                      />
                    </div>
                    <Button
                      className="text-xs"
                      disabled={!managerPick[s.id] || roleMutation.isPending}
                      onClick={() =>
                        roleMutation.mutate({
                          userId: managerPick[s.id],
                          scope: "store",
                          scopeId: s.id,
                          role: "manager",
                        })
                      }
                    >
                      {t("org.appoint")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {oversees && (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createStoreMutation.mutate();
            }}
          >
            <div className="min-w-56 flex-1">
              <Label htmlFor="store-name">{t("org.new_store")}</Label>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={t("org.store_name_placeholder")}
              />
            </div>
            <Button
              type="submit"
              disabled={!storeName.trim() || createStoreMutation.isPending}
            >
              {t("org.create")}
            </Button>
          </form>
        )}
        <p className="mt-3 text-xs text-brand-muted">{t("org.manager_hint")}</p>
      </Card>
    </div>
  );
}

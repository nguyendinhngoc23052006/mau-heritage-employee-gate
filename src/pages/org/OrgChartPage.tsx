import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/EmptyState";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { getOrgChart } from "../../services/org";
import type { OrgChartPerson, OrgChartUnit } from "../../types/database";

function PersonRow({
  person,
  caption,
}: {
  person: OrgChartPerson;
  caption: string;
}) {
  return (
    <div className="text-sm leading-snug">
      <span className="font-medium text-brand-ink">{person.name}</span>{" "}
      <span className="text-xs text-brand-muted">· {caption}</span>
    </div>
  );
}

function NodeCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div
      className="inline-block min-w-40 max-w-60 rounded-lg border border-brand-hairline bg-brand-surface px-3 py-2 text-left shadow-sm"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="mb-1 text-sm font-bold text-brand-ink">{title}</div>
      {children}
    </div>
  );
}

function UnitNode({ unit }: { unit: OrgChartUnit }) {
  const t = useT();
  return (
    <NodeCard title={unit.name} accent="var(--color-brand-green)">
      {unit.managers.map((p) => (
        <PersonRow key={p.id} person={p} caption={t("people.role_manager")} />
      ))}
      {unit.employees.map((p) => (
        <PersonRow key={p.id} person={p} caption={t("people.role_employee")} />
      ))}
      {unit.managers.length + unit.employees.length === 0 && (
        <div className="text-xs text-brand-muted">
          {t("org_chart.empty_unit")}
        </div>
      )}
    </NodeCard>
  );
}

// The whole company as one tree, drawn from the single org_chart() snapshot:
// tier 1 on top, each khối a branch, its units below with their people. Every
// device renders the same document; the connectors are pure CSS (.org-tree in
// index.css), so nothing here recomputes anything per node.
export function OrgChartPage() {
  const t = useT();
  const chart = useQuery({
    queryKey: ["org", "chart"],
    queryFn: getOrgChart,
    refetchOnWindowFocus: true,
  });

  if (chart.isLoading)
    return <LoadingState>{t("common.loading")}</LoadingState>;
  if (chart.error || !chart.data)
    return <ErrorState message={errorMessage(chart.error, t("org.error"))} />;
  const c = chart.data;
  const empty =
    c.tier1.length === 0 && c.sectors.length === 0 && c.unassigned.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display text-brand-ink">
        {t("org_chart.title")}
      </h1>
      {empty ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="org-tree min-w-max">
            <ul>
              <li>
                <NodeCard
                  title={t("org_chart.leadership")}
                  accent="var(--color-brand-gold)"
                >
                  {c.tier1.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      caption={t(`people.role_${p.role ?? "ceo"}`)}
                    />
                  ))}
                  {c.tier1.length === 0 && (
                    <div className="text-xs text-brand-muted">—</div>
                  )}
                </NodeCard>
                {c.sectors.length > 0 && (
                  <ul>
                    {c.sectors.map((s) => (
                      <li key={s.id}>
                        <NodeCard
                          title={s.name}
                          accent="var(--color-brand-navy)"
                        >
                          {s.directors.map((p) => (
                            <PersonRow
                              key={p.id}
                              person={p}
                              caption={t("people.role_director")}
                            />
                          ))}
                          {s.directors.length === 0 && (
                            <div className="text-xs text-brand-muted">
                              {t("org.no_directors")}
                            </div>
                          )}
                        </NodeCard>
                        {s.units.length > 0 && (
                          <ul>
                            {s.units.map((u) => (
                              <li key={u.id}>
                                <UnitNode unit={u} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </div>
        </div>
      )}
      {c.unassigned.length > 0 && (
        <div className="max-w-md">
          <NodeCard
            title={t("org_chart.unassigned")}
            accent="var(--color-brand-red)"
          >
            {c.unassigned.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                caption={t("org_chart.waiting")}
              />
            ))}
          </NodeCard>
        </div>
      )}
    </div>
  );
}

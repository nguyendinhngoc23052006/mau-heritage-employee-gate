import { useNavigate, useParams } from "react-router-dom";
import { useMemberships } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";

export function StoreSwitcher() {
  const { data, isLoading } = useMemberships();
  const { storeId } = useParams();
  const navigate = useNavigate();
  const t = useT();

  if (isLoading) return <span className="text-sm text-slate-500">{t("common.loading")}</span>;
  if (!data || data.length === 0) return null;
  if (data.length === 1) {
    return <span className="text-sm font-medium text-slate-700">{data[0].store.name}</span>;
  }
  return (
    <select
      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      value={storeId ?? ""}
      onChange={(e) => navigate(`/store/${e.target.value}`)}
      aria-label={t("store.switcher.label")}
    >
      {data.map((m) => (
        <option key={m.store_id} value={m.store_id}>
          {m.store.name}
        </option>
      ))}
    </select>
  );
}

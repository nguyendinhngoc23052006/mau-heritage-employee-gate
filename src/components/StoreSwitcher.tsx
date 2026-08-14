import { useNavigate, useParams } from "react-router-dom";
import { useMemberships } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";

const ADD_SENTINEL = "__add__";

export function StoreSwitcher() {
  const { data, isLoading } = useMemberships();
  const { storeId } = useParams();
  const navigate = useNavigate();
  const t = useT();

  if (isLoading)
    return (
      <span className="text-sm text-slate-500">{t("common.loading")}</span>
    );
  if (!data || data.length === 0) return null;

  const onChange = (value: string) => {
    if (value === ADD_SENTINEL) {
      navigate("/onboarding?add=1");
    } else {
      navigate(`/store/${value}`);
    }
  };

  return (
    <select
      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      value={storeId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("store.switcher.label")}
    >
      {data.map((m) => (
        <option key={m.store_id} value={m.store_id}>
          {m.store.name}
        </option>
      ))}
      <option value={ADD_SENTINEL}>{t("store.switcher.add")}</option>
    </select>
  );
}

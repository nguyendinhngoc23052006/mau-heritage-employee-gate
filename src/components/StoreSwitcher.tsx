import { useNavigate, useParams } from "react-router-dom";
import { useMemberships } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { Select } from "./ui/Select";

export function StoreSwitcher() {
  const { data, isLoading } = useMemberships();
  const { storeId } = useParams();
  const navigate = useNavigate();
  const t = useT();

  if (isLoading)
    return (
      <span className="text-sm text-slate-500">{t("common.loading")}</span>
    );
  if (!data) return null;

  const onChange = (value: string) => {
    navigate(`/store/${value}`);
  };

  if (data.length === 0) return null;

  const options = data.map((m) => ({
    value: m.store_id,
    label: m.store.name,
  }));

  const searchable = data.length >= 6;

  return (
    <Select
      value={storeId ?? ""}
      onChange={onChange}
      options={options}
      ariaLabel={t("store.switcher.label")}
      searchable={searchable}
    />
  );
}

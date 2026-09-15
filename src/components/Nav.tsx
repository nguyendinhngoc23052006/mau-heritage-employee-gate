import { NavLink, useParams } from "react-router-dom";
import { useStoreAccess } from "../hooks/useStoreAccess";
import { useT } from "../lib/i18n";

interface Item {
  to: string;
  labelKey: string;
  managerOnly?: boolean;
  ownerOnly?: boolean;
}

const ITEMS: Item[] = [
  { to: "", labelKey: "nav.dashboard" },
  { to: "schedule", labelKey: "nav.schedule" },
  { to: "clock", labelKey: "nav.clock" },
  { to: "sales", labelKey: "nav.sales" },
  { to: "announcements", labelKey: "nav.announcements" },
  { to: "me", labelKey: "nav.me" },
  { to: "people", labelKey: "nav.people", managerOnly: true },
  { to: "rules", labelKey: "nav.rules", managerOnly: true },
  { to: "payroll", labelKey: "nav.payroll", managerOnly: true },
  { to: "audit", labelKey: "nav.audit", managerOnly: true },
  { to: "analytics", labelKey: "nav.analytics", managerOnly: true },
  { to: "settings", labelKey: "nav.settings", managerOnly: true },
];

export function Nav() {
  const { storeId } = useParams();
  const { role, canManage, canEnter } = useStoreAccess(storeId);
  const t = useT();
  if (!storeId || !canEnter) return null;

  const visible = ITEMS.filter((i) => {
    if (i.ownerOnly) return role === "owner" || canManage;
    if (i.managerOnly) return canManage;
    return true;
  });

  return (
    <nav className="border-b border-brand-hairline bg-white">
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((i) => (
          <NavLink
            key={i.to}
            to={i.to === "" ? "." : i.to}
            end={i.to === ""}
            className={({ isActive }) =>
              `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-brand-navy text-brand-cream"
                  : "text-brand-ink hover:bg-brand-cream-light"
              }`
            }
          >
            {t(i.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

import type { ReactNode } from "react";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-brand-hairline bg-white p-4 shadow-sm ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`mb-2 text-lg font-semibold text-brand-ink font-display ${className ?? ""}`}
    >
      {children}
    </h2>
  );
}

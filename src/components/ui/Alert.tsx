import type { JSX } from "react";

type AlertVariant = "success" | "error" | "info" | "warning";

export interface AlertProps {
  variant: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export function Alert(props: AlertProps): JSX.Element {
  const { variant, children, className = "" } = props;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`rounded-md border p-3 text-sm ${variantStyles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

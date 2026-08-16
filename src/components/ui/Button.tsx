import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-brand-navy text-brand-cream hover:bg-brand-navy-dark disabled:bg-brand-muted disabled:text-brand-cream/70",
  secondary:
    "bg-white text-brand-ink border border-brand-hairline hover:bg-brand-cream-light disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "text-brand-ink hover:bg-brand-cream-light disabled:opacity-50",
};

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      type={props.type ?? "button"}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition ${styles[variant]} ${className ?? ""}`}
      {...props}
    />
  );
}

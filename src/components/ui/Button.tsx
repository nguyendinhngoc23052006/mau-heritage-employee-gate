import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400",
  secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:opacity-50",
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

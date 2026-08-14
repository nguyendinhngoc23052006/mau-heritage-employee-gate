import type { JSX } from "react";

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function Checkbox(props: CheckboxProps): JSX.Element {
  const {
    id,
    checked,
    onChange,
    disabled = false,
    label,
    className = "",
  } = props;

  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        className="accent-slate-900"
      />
      {label && <span className="text-sm text-slate-900">{label}</span>}
    </label>
  );
}

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`block w-full rounded-md border border-brand-hairline px-3 py-2 text-sm shadow-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy ${className ?? ""}`}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`block w-full rounded-md border border-brand-hairline px-3 py-2 text-sm shadow-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy ${className ?? ""}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-sm font-medium text-brand-ink"
    >
      {children}
    </label>
  );
}

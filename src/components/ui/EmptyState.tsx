import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">{message}</div>;
}

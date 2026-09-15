interface Props {
  className?: string;
}

export function Wordmark({ className }: Props) {
  return (
    <span
      className={`font-display font-black tracking-tight text-brand-ink ${className ?? ""}`}
      style={{ letterSpacing: "-0.02em", lineHeight: 1 }}
    >
      KWOOK <span className="font-semibold text-brand-navy">VIỆT NAM</span>
    </span>
  );
}

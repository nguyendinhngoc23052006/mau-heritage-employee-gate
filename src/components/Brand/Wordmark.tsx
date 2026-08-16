interface Props {
  className?: string;
}

export function Wordmark({ className }: Props) {
  return (
    <span
      className={`font-display font-black tracking-tight text-brand-navy dark:text-brand-cream ${className ?? ""}`}
      style={{ letterSpacing: "-0.02em", lineHeight: 1 }}
    >
      MẦU HERITAGE
    </span>
  );
}

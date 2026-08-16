interface Props {
  className?: string;
  ariaLabel?: string;
}

// PLACEHOLDER — approximates the two-crescent silhouette (peaked "roof" top +
// bowl-like bottom). Replace with the traced SVG when the brand team sends it.
export function LogoMark({ className, ariaLabel = "Màu Heritage" }: Props) {
  return (
    <svg
      viewBox="0 0 200 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      fill="currentColor"
    >
      <path d="M 15 55 Q 100 15 185 55 Q 100 40 15 55 Z" />
      <path d="M 15 55 Q 100 95 185 55 Q 100 70 15 55 Z" />
    </svg>
  );
}

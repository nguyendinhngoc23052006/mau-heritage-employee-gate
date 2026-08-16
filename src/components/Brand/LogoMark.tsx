interface Props {
  className?: string;
  ariaLabel?: string;
}

// PLACEHOLDER — replace inner <path> with the traced SVG when the brand
// team provides the actual mark file. Approximates the two-blade wave.
export function LogoMark({ className, ariaLabel = "Mầu Heritage" }: Props) {
  return (
    <svg
      viewBox="0 0 200 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
      fill="currentColor"
    >
      <path d="M 10 55 Q 65 15 100 40 Q 135 15 190 55 Q 135 35 100 55 Q 65 35 10 55 Z" />
      <path
        d="M 10 55 Q 65 75 100 60 Q 135 75 190 55 Q 135 90 100 78 Q 65 90 10 55 Z"
        opacity="0.85"
      />
    </svg>
  );
}

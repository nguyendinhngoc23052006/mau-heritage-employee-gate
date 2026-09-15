interface Props {
  className?: string;
  ariaLabel?: string;
}

// The four-petal pinwheel from the Kwook logo; petal colors sampled from the
// original artwork: gold, green, red, blue, meeting at the center.
export function LogoMark({ className, ariaLabel = "Kwook Việt Nam" }: Props) {
  const petal = "M50 50 C45 29 33 17 12 12 C17 33 29 45 50 50 Z";
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <path d={petal} fill="#f9b431" />
      <path d={petal} fill="#79b84f" transform="rotate(90 50 50)" />
      <path d={petal} fill="#e4353c" transform="rotate(180 50 50)" />
      <path d={petal} fill="#336eb4" transform="rotate(270 50 50)" />
    </svg>
  );
}

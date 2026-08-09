export function DirectionBadge({ direction }: { direction: string }) {
  const styles: Record<string, string> = {
    long: "bg-long/15 text-long",
    short: "bg-short/15 text-short",
    neutral: "bg-slate-500/15 text-slate-400",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium uppercase ${styles[direction] ?? styles.neutral}`}>
      {direction}
    </span>
  );
}

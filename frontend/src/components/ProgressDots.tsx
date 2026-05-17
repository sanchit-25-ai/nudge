type ProgressDotsProps = { count: number; current: number };

export default function ProgressDots({ count, current }: ProgressDotsProps) {
  return (
    <div
      data-testid="progress-dots"
      role="presentation"
      aria-hidden="true"
      className="flex items-center gap-2"
    >
      {Array.from({ length: count }).map((_, i) => {
        const past = i < current;
        const active = i === current;
        const base = "h-2 w-2 rounded-full transition-colors";
        const colour = past || active ? "bg-primary" : "bg-border";
        const ring = active ? "ring-2 ring-primary ring-offset-2" : "";
        return <span key={i} className={`${base} ${colour} ${ring}`} />;
      })}
    </div>
  );
}

import type { ReactNode } from "react";

type PillProps = {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: "radio" | "checkbox";
  tabIndex?: number;
  refCallback?: (el: HTMLButtonElement | null) => void;
};

export default function Pill({
  selected,
  onClick,
  children,
  role = "radio",
  tabIndex,
  refCallback,
}: PillProps) {
  const base =
    "min-h-11 min-w-11 px-4 rounded-full font-medium border transition-colors";
  const colour = selected
    ? "bg-primary text-white border-primary"
    : "bg-surface-warm text-text-primary border-border";
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      tabIndex={tabIndex}
      ref={refCallback}
      onClick={onClick}
      className={`${base} ${colour}`}
    >
      {children}
    </button>
  );
}

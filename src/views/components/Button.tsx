// Presentational component: props in, markup out. No state, no data access.

import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`h-10 min-w-10 rounded-lg bg-foreground px-4 font-medium text-background transition-opacity hover:opacity-80 ${className}`}
      {...props}
    />
  );
}

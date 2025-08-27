import { ReactNode } from "react";

export function Card({ title, description, children }:{
  title?: string; description?: string; children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 shadow-sm backdrop-blur
                    dark:border-neutral-800 dark:bg-neutral-900/60">
      {(title || description) && (
        <div className="mb-3">
          {title && <h3 className="text-base font-medium">{title}</h3>}
          {description && <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

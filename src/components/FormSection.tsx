import type { ReactNode } from 'react';

// Groups related form fields under an uppercase eyebrow header (matches the
// eyebrow style used on /permissions). Sections after the first get a hairline
// divider + top spacing so the groups read as distinct blocks.
export function FormSection({
  title,
  first,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={first ? undefined : 'border-t border-hair-1 pt-4'}>
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// Generic presentational table for the data-management screens (Personas,
// Closers, Calendarios — and future tables). Matches the design-system kit:
// full-width, no zebra striping, 1px hairline row dividers, 12px row padding.
// Holds no data logic — callers pass columns + rows and render their own cells.

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  // Cell content for a row. Keep colors in the rendered node (text-fg-1, etc.).
  render: (row: T) => ReactNode;
};

export function Table<T>({
  columns,
  rows,
  getRowKey,
  empty,
  actions,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: string;
  // Optional right-aligned action cell (edit/delete buttons) per row.
  actions?: (row: T) => ReactNode;
}) {
  const colCount = columns.length + (actions ? 1 : 0);
  return (
    <div className="border border-hair-2 bg-bg-1">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-hair-2 text-fg-3">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-2.5 font-medium',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {c.header}
              </th>
            ))}
            {actions && <th className="px-4 py-2.5 text-right font-medium" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-4 text-fg-3">
                {empty ?? es.common.empty}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-t border-hair-1">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('px-4 py-3', c.align === 'right' ? 'text-right' : 'text-left')}
                >
                  {c.render(row)}
                </td>
              ))}
              {actions && <td className="px-4 py-3 text-right">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

// Generic presentational table for the data-management screens (Personas,
// Closers, Calendarios, Members, Logs, Audit, Invitations — and future tables).
// Backed by @tanstack/react-table so every table in the app shares one engine.
// Matches the design-system kit: full-width, no zebra striping, 1px hairline row
// dividers, 12px row padding. Holds no data logic — callers pass columns + rows
// and render their own cells. Sorting is opt-in per column via `sortValue`.

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  // Cell content for a row. Keep colors in the rendered node (text-fg-1, etc.).
  render: (row: T) => ReactNode;
  // Provide to make the column sortable: the header becomes a click-to-sort
  // button and rows sort on this value. Omit for a static column.
  sortValue?: (row: T) => string | number | boolean | null | undefined;
};

export function Table<T>({
  columns,
  rows,
  getRowKey,
  empty,
  actions,
  pagination,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: string;
  // Optional right-aligned action cell (edit/delete buttons) per row.
  actions?: (row: T) => ReactNode;
  pagination?: {
    pageSize?: number;
    pageSizeOptions?: number[];
  };
}) {
  const hasPagination = !!pagination;
  const defaultPageSize = pagination?.pageSize ?? 25;
  const pageSizeOptions = pagination?.pageSizeOptions ?? [10, 25, 50, 100];
  const rowCount = rows.length;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  useEffect(() => {
    if (!hasPagination) return;
    setPaginationState((prev) =>
      prev.pageSize === defaultPageSize ? prev : { pageIndex: 0, pageSize: defaultPageSize },
    );
  }, [defaultPageSize, hasPagination]);

  useEffect(() => {
    if (!hasPagination) return;
    setPaginationState((prev) => {
      if (rowCount === 0) return prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 };
      return prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 };
    });
  }, [hasPagination, rowCount]);

  // Map the design-system column API onto TanStack column defs. The accessorFn
  // (when sortable) feeds the sort comparator; the cell always renders via the
  // caller's render(). The actions column is an unsortable trailing display col.
  const columnDefs = useMemo<ColumnDef<T>[]>(() => {
    const defs: ColumnDef<T>[] = columns.map((c) => ({
      id: c.key,
      accessorFn: c.sortValue ? (row) => c.sortValue?.(row) ?? null : undefined,
      enableSorting: !!c.sortValue,
      header: () => c.header,
      cell: ({ row }) => c.render(row.original),
      meta: { align: c.align },
      sortUndefined: 'last',
    }));
    if (actions) {
      defs.push({
        id: '__actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => actions(row.original),
        meta: { align: 'right' },
      });
    }
    return defs;
  }, [columns, actions]);

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: {
      sorting,
      ...(hasPagination ? { pagination: paginationState } : {}),
    },
    onSortingChange: setSorting,
    ...(hasPagination ? { onPaginationChange: setPaginationState } : {}),
    getRowId: getRowKey,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(hasPagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const colCount = columnDefs.length;
  const pageCount = hasPagination ? table.getPageCount() : 1;
  const pageIndex = hasPagination ? table.getState().pagination.pageIndex : 0;
  const pageSize = hasPagination ? table.getState().pagination.pageSize : rows.length;
  const pageStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = rowCount === 0 ? 0 : Math.min((pageIndex + 1) * pageSize, rowCount);

  return (
    <div className="border border-hair-2 bg-bg-1">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-[12px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-hair-2 text-fg-3">
                {hg.headers.map((header) => {
                  const align = (header.column.columnDef.meta as { align?: 'left' | 'right' })
                    ?.align;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : canSort
                              ? 'none'
                              : undefined
                      }
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 font-medium',
                        align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          title={es.common.sortBy}
                          className={cn(
                            'inline-flex items-center gap-1 font-medium transition-colors duration-140 ease-achievers hover:text-fg-1',
                            align === 'right' && 'flex-row-reverse',
                            sorted && 'text-fg-1',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIndicator dir={sorted} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-4 text-fg-3">
                  {empty ?? es.common.empty}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-hair-1">
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as { align?: 'left' | 'right' })?.align;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'whitespace-nowrap px-4 py-3',
                        align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasPagination && rowCount > 0 && (
        <div className="flex flex-col gap-3 border-t border-hair-2 px-4 py-3 text-[12px] text-fg-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span>
              {es.common.pageRange
                .replace('{from}', String(pageStart))
                .replace('{to}', String(pageEnd))
                .replace('{total}', String(rowCount))}
            </span>
            <label htmlFor="table-page-size" className="flex items-center gap-2">
              <span>{es.common.rowsPerPage}</span>
              <select
                id="table-page-size"
                value={pageSize}
                onChange={(e) =>
                  table.setPageSize(Number.parseInt(e.target.value, 10) || defaultPageSize)
                }
                className="h-8 rounded-none border border-hair-2 bg-bg-1 px-2 font-mono text-[12px] text-fg-1 outline-none transition-colors duration-140 ease-achievers focus-visible:border-brand focus-visible:shadow-[0_0_0_2px_rgba(245,158,11,0.18)]"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 md:justify-end">
            <span>
              {es.common.pageLabel
                .replace('{page}', String(pageIndex + 1))
                .replace('{pages}', String(pageCount))}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                {es.common.previous}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                {es.common.next}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small caret that reflects the active sort direction. Dimmed when unsorted so
// sortable columns hint at the affordance without shouting.
function SortIndicator({ dir }: { dir: false | 'asc' | 'desc' }) {
  return (
    <span aria-hidden className={cn('text-[9px] leading-none', dir ? 'text-brand' : 'text-fg-4')}>
      {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}
    </span>
  );
}

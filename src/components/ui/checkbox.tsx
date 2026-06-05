import { cn } from '@/lib/utils';
import type * as React from 'react';

// Achievers checkbox: a 16px sharp-cornered native checkbox tinted with the
// brand amber (accent-color), for the tinyint(1) boolean fields (activo,
// setter). Native rendering keeps it accessible and keyboard-operable.
function Checkbox({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 cursor-pointer rounded-none border border-hair-2 bg-bg-1 accent-brand outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };

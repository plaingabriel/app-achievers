import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';
import { cn } from '~/lib/utils';

// Achievers form label: 11px, uppercase, wide tracking, tertiary text,
// 6px gap below (matches the design system's `.label`).
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3',
        className,
      )}
      {...props}
    />
  );
}

export { Label };

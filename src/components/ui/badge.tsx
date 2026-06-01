import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

// Achievers status pill: sharp, uppercase, 10px, 1px border. Colors come
// straight from the design system's semantic tokens (exact hex borders match
// the kit). Compose a 6px status dot as a child: <span className="size-1.5
// rounded-full bg-current" />.
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-none border px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.08em]',
  {
    variants: {
      variant: {
        success: 'border-[#15391f] bg-success-bg text-success',
        warning: 'border-[#42310a] bg-warning-bg text-warning',
        danger: 'border-[#3f1414] bg-danger-bg text-danger',
        info: 'border-[#15294f] bg-info-bg text-info',
        idle: 'border-hair-2 bg-bg-1 text-fg-2',
      },
    },
    defaultVariants: { variant: 'idle' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

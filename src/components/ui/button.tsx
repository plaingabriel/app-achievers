import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '~/lib/utils';

// Achievers buttons: monospace, semibold, sharp corners, 1px border, amber
// primary on black. Sizes track the design system exactly (26 / 32 / 40px).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border font-mono font-semibold outline-none transition-colors duration-[140ms] ease-achievers focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[14px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-hair-2 bg-transparent text-fg-1 hover:border-hair-4',
        primary:
          'border-brand bg-primary text-primary-foreground hover:border-brand-hover hover:bg-brand-hover active:border-brand-press active:bg-brand-press',
        ghost: 'border-transparent bg-transparent text-fg-2 hover:bg-bg-2 hover:text-fg-1',
        secondary: 'border-hair-2 bg-transparent text-fg-1 hover:border-hair-4',
      },
      size: {
        sm: 'h-[26px] px-[10px] text-[12px]',
        default: 'h-8 px-[14px] text-[13px]',
        lg: 'h-10 px-[18px] text-[14px]',
        icon: 'h-8 w-8 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

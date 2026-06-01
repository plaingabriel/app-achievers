import type * as React from 'react';
import { cn } from '~/lib/utils';

// Achievers input: 36px tall, bg-1 fill, 1px hairline border, amber focus
// border + soft amber glow. Monospace, sharp corners.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-none border border-hair-2 bg-bg-1 px-3 font-mono text-[13px] text-fg-1 outline-none transition-colors duration-[140ms] ease-achievers placeholder:text-fg-4 focus-visible:border-brand focus-visible:shadow-[0_0_0_2px_rgba(245,158,11,0.18)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

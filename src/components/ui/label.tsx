import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';

// Achievers form label: 11px, uppercase, wide tracking, tertiary text,
// 6px gap below (matches the design system's `.label`). Pass `required` to append
// a danger-colored asterisk marking the field as obligatory (optional fields are
// left plain); the asterisk carries an aria-label for screen readers.
function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span
          className="ml-0.5 text-danger"
          title={es.forms.required}
          aria-label={es.forms.required}
        >
          *
        </span>
      )}
    </LabelPrimitive.Root>
  );
}

export { Label };

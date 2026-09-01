import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// buttonVariants is exported so anchors can wear the same clothes without
// nesting a <button> inside an <a>. Prefer `<a class={buttonVariants(...)}>`
// over a Slot/asChild indirection — this site is mostly links.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The cartoon outline in UI form. `pressable` collapses the offset
        // shadow on click, so the button physically presses into the page.
        default: 'bg-ink text-paper outlined pressable',
        hivis: 'bg-hi-vis text-ink outlined pressable',
        secondary: 'bg-card text-ink outlined pressable',
        outline: 'border-border text-foreground hover:border-ink border bg-transparent',
        ghost: 'hover:bg-accent/40 text-foreground',
        link: 'text-foreground underline decoration-hi-vis decoration-2 underline-offset-4',
        destructive: 'bg-destructive text-destructive-foreground outlined pressable',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        default: 'h-9 px-4 py-2',
        lg: 'h-11 rounded-md px-6 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = 'Button';

export { Button };

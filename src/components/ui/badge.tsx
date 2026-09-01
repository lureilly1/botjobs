import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Evidence variants are text badges by deliberate policy — never stars, never a
// numeric score rendered as a rating. An internal score drawn as stars reads as
// a user rating to both people and Google, and we have no user reviews.
// See the plan §3 and §10.
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',

        // Evidence tiers. Each carries a tinted dot rendered by the caller.
        listed: 'border-evidence-listed/25 bg-evidence-listed/10 text-evidence-listed',
        'source-linked':
          'border-evidence-source-linked/25 bg-evidence-source-linked/10 text-evidence-source-linked',
        'link-verified':
          'border-evidence-verified/25 bg-evidence-verified/10 text-evidence-verified',

        // A job nobody has built a bot for yet. A vacancy, not an error.
        open: 'border-open-job/30 bg-open-job/10 text-open-job',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };

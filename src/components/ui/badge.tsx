import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Evidence variants are text badges by deliberate policy — never stars, never a
// numeric score rendered as a rating. An internal score drawn as stars reads as
// a user rating to both people and Google, and we have no user reviews.
// See the plan §3 and §10.
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-tight whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-ink bg-ink text-paper',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-ink text-foreground',

        // Evidence tiers. Each carries a tinted dot rendered by the caller.
        listed: 'border-evidence-listed/30 bg-evidence-listed/8 text-evidence-listed',
        'source-linked':
          'border-evidence-source-linked/30 bg-evidence-source-linked/8 text-evidence-source-linked',
        'link-verified':
          'border-evidence-verified/30 bg-evidence-verified/8 text-evidence-verified',

        // A job nobody has built a bot for yet. A vacancy, not an error — so it
        // wears the hard hat colour rather than a warning colour.
        open: 'border-ink bg-hi-vis text-ink',
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

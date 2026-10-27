import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      success: 'bg-emerald-50 text-emerald-700',
      info: 'bg-indigo-50 text-brand',
      danger: 'bg-rose-50 text-rose-600',
      muted: 'bg-slate-100 text-slate-500',
    },
  },
  defaultVariants: { variant: 'muted' },
})

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
)

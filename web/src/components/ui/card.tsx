import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]', className)} {...props} />
)

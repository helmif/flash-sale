import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-50',
      className,
    )}
    {...props}
  />
)

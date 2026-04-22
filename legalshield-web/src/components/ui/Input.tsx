import * as React from "react"
import { clsx } from "clsx"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={clsx(
          "flex h-11 w-full rounded-lg border border-lex-deep/10 bg-white px-4 py-2 text-sm text-lex-dark shadow-sm transition-all placeholder:text-lex-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lex-deep/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

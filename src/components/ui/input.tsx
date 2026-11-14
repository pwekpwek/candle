import * as React from "react"
import { cn } from "cn"

/*
 * Blueprint "Field": 40px control (44px on touch via globals.css), 1px
 * border-input on bg-card, 16px text. Error state comes from aria-invalid.
 * Number fields are type="text" with inputMode set by the caller.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-colors duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }

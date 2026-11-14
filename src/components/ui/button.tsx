import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { Loader2Icon } from "lucide-react"

/*
 * Blueprint section 4. Primary: bg-primary. Secondary: bg-secondary with a
 * 1px border. Quiet ("link"): text in primary, underline on hover. Destructive
 * only inside a confirmation. 40px high (44px on touch, enforced in
 * globals.css). Focus uses the one global :focus-visible outline.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-base font-semibold whitespace-nowrap transition-colors duration-150 outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border-input bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-sm",
        lg: "h-11 px-5",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Busy state (FLOW-07): a spinner appears over the label, the width stays
     * locked, `aria-busy` is set and further presses are ignored. The button
     * stays enabled so focus is not lost.
     */
    busy?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  busy = false,
  onClick,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={onClick}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (busy) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleClick}
      {...props}
    >
      {busy ? (
        <>
          <span className="invisible inline-flex items-center gap-2">
            {children}
          </span>
          <Loader2Icon
            aria-hidden="true"
            className="absolute animate-spin"
            strokeWidth={1.75}
          />
        </>
      ) : (
        children
      )}
    </button>
  )
}

export { Button, buttonVariants }

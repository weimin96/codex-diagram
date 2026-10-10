import type { ComponentProps } from "react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type IconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label"> & {
  icon: LucideIcon
  label: string
  tooltip?: string
}

export function IconButton({ icon: Icon, label, tooltip = label, size = "icon-sm", variant = "ghost", ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} size={size} variant={variant} {...props}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

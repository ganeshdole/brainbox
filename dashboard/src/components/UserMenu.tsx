import { useSession } from "@hono/auth-js/react";
import { EllipsisVertical, LogOut } from "lucide-react";

import { logout } from "../lib/logout";
import { cn, userInitial } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function Avatar({ image, initial, className }: { image?: string | null; initial: string; className?: string }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-lg object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-interactive text-sm font-medium text-emphasis",
        className,
      )}
    >
      {initial}
    </span>
  );
}

/** Sidebar footer: user card whose menu opens to the right, over the content area. */
export function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  const name = user?.name ?? user?.email ?? "";
  const initial = userInitial(user?.name, user?.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none press [--press-scale:0.985] hover:bg-interactive-hover focus-visible:ring-[3px] focus-visible:ring-focus data-[state=open]:bg-interactive"
      >
        <Avatar image={user?.image} initial={initial} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-emphasis">{name}</span>
          {user?.email && user.name && (
            <span className="block truncate text-xs text-muted">{user.email}</span>
          )}
        </span>
        <EllipsisVertical className="h-4 w-4 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      {/* footer has 8px padding, so 16px from the trigger = 8px of visible
          air between the sidebar border and the menu */}
      <DropdownMenuContent side="right" align="end" sideOffset={16}>
        <DropdownMenuLabel className="flex items-center gap-2.5">
          <Avatar image={user?.image} initial={initial} className="size-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            {user?.email && user.name && (
              <span className="block truncate text-xs font-normal text-muted">{user.email}</span>
            )}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

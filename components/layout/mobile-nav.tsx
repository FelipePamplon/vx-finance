"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { navGroups } from "@/lib/nav-items";
import { Button } from "@/components/ui/button";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <Menu className="size-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:[animation:overlay-show_150ms_ease-out] data-[state=closed]:[animation:overlay-hide_150ms_ease-in] md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card shadow-xl outline-none data-[state=open]:[animation:drawer-show_200ms_ease-out] data-[state=closed]:[animation:drawer-hide_150ms_ease-in] md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <DialogPrimitive.Title asChild>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                VX <span className="text-primary">Capital</span>
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar menu">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
            {navGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <span className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        isActive && "bg-accent text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 h-5 w-0.5 rounded-full bg-primary transition-opacity",
                          isActive ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

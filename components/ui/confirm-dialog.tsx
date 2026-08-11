"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolveRef = useRef<(value: boolean) => void>();

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next && !isConfirming) {
      resolveRef.current?.(false);
    }
    setOpen(next);
  }

  function handleCancel() {
    resolveRef.current?.(false);
    setOpen(false);
  }

  async function handleConfirm() {
    setIsConfirming(true);
    resolveRef.current?.(true);
    setOpen(false);
    setIsConfirming(false);
  }

  const ConfirmDialog = (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {options.variant === "destructive" && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-4" />
              </span>
            )}
            <DialogTitle>{options.title}</DialogTitle>
          </div>
          {options.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            {options.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            type="button"
            variant={options.variant === "destructive" ? "destructive" : "default"}
            isLoading={isConfirming}
            onClick={handleConfirm}
          >
            {options.confirmLabel ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}

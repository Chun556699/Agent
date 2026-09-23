import * as React from "react";
import {
  Tooltip as RTooltip,
  Select as RSelect,
  Switch as RSwitch,
  DropdownMenu as RMenu,
  Dialog as RDialog,
} from "radix-ui";
import { Check, ChevronDown } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ── Tooltip ── */

export function Tip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="anim-pop z-50 max-w-56 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[11px] leading-snug text-ink-2 shadow-pop select-none"
        >
          {content}
          <RTooltip.Arrow className="fill-card" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/* ── Select (pill) ── */

export type SelectOption = { value: string; label: string; hint?: string };

/** Radix rejects "" as an item value — we use a sentinel and translate. */
const EMPTY = "__none__";

export function PillSelect({
  value,
  onValue,
  options,
  placeholder,
  className,
}: {
  value: string;
  onValue: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <RSelect.Root
      value={value === "" ? EMPTY : value}
      onValueChange={(v) => onValue(v === EMPTY ? "" : v)}
    >
      <RSelect.Trigger
        className={cx(
          "input !rounded-full !py-1.5 !pl-3.5 !pr-2.5 text-[12px] flex items-center justify-between gap-2 cursor-pointer outline-none data-[placeholder]:text-ink-3 min-w-0",
          className,
        )}
      >
        <SelectValueOrPlaceholder placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown size={12} className="text-ink-3" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="anim-pop z-50 card overflow-hidden min-w-[var(--radix-select-trigger-width)] max-w-[320px]"
        >
          <RSelect.Viewport className="p-1 max-h-72 overflow-y-auto">
            {options.map((o) => (
              <RSelect.Item
                key={o.value === "" ? EMPTY : o.value}
                value={o.value === "" ? EMPTY : o.value}
                className="group relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-ink-2 outline-none cursor-pointer data-[highlighted]:bg-fill data-[highlighted]:text-ink data-[state=checked]:text-ink data-[state=checked]:font-medium"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint && (
                  <span className="text-[10px] text-ink-3 truncate">{o.hint}</span>
                )}
                <RSelect.ItemIndicator className="ml-auto pl-2">
                  <Check size={12} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

function SelectValueOrPlaceholder({ placeholder }: { placeholder?: string }) {
  // Select.Value renders the selected item's text; we want truncation.
  return (
    <span className="truncate">
      <RSelect.Value placeholder={placeholder} />
    </span>
  );
}

/* ── Switch ── */

export function Switch({
  checked,
  onChecked,
  disabled,
  className,
}: {
  checked: boolean;
  onChecked: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChecked}
      disabled={disabled}
      className={cx(
        "w-[34px] h-[19px] rounded-full bg-fill-2 border border-line relative shrink-0 cursor-pointer transition-colors outline-none",
        "data-[state=checked]:bg-ink data-[state=checked]:border-ink",
        "data-[disabled]:opacity-40 data-[disabled]:cursor-default",
        className,
      )}
    >
      <RSwitch.Thumb className="block w-[15px] h-[15px] rounded-full bg-card shadow-sm translate-x-[1px] transition-transform duration-150 data-[state=checked]:translate-x-[17px] will-change-transform" />
    </RSwitch.Root>
  );
}

/* ── Expandable (animated height reveal) ── */

export function Expandable({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={cx("expand", open && "open")}>
      <div className="expand-inner">{children}</div>
    </div>
  );
}

/* ── Dropdown menu ── */

export function Menu({
  trigger,
  children,
  align = "end",
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align={align}
          sideOffset={5}
          className="anim-pop z-50 card p-1 min-w-40"
        >
          {children}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export function MenuItem({
  onSelect,
  destructive,
  children,
}: {
  onSelect: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RMenu.Item
      onSelect={onSelect}
      className={cx(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] outline-none cursor-pointer",
        destructive
          ? "text-err data-[highlighted]:bg-err/10"
          : "text-ink-2 data-[highlighted]:bg-fill data-[highlighted]:text-ink",
      )}
    >
      {children}
    </RMenu.Item>
  );
}

/* ── Dialog ── */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="anim-fade fixed inset-0 z-40 bg-ink/25" />
        <RDialog.Content className="anim-pop fixed left-1/2 top-1/2 z-50 w-[min(540px,92vw)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto card p-5">
          <RDialog.Title className="font-display text-[19px] tracking-tight">
            {title}
          </RDialog.Title>
          {description && (
            <RDialog.Description className="mt-1 text-[12px] text-ink-2">
              {description}
            </RDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

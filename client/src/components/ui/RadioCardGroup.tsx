// A group of choices shown as cards, built from native radio inputs (arrow keys move between them, the group is announced with its legend). `ColorSwatches` below is the same idea for colours.
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { readableTextOn } from "../../lib/color";

type Option<T extends string> = { value: T; label: string; description?: string; icon?: ReactNode };

type RadioCardGroupProps<T extends string> = {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<Option<T>>;
  disabled?: boolean;
  hint?: string;
};

export function RadioCardGroup<T extends string>({ legend, name, value, onChange, options, disabled = false, hint }: RadioCardGroupProps<T>) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-foreground">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border border-input bg-background p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              value === option.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
            )}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            {option.icon && <span className="mt-0.5 text-muted-foreground">{option.icon}</span>}
            <span>
              <span className="block font-medium text-foreground">{option.label}</span>
              {option.description && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

type ColorSwatchesProps = {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  colors: Array<{ name: string; value: string }>;
};

export function ColorSwatches({ legend, name, value, onChange, colors }: ColorSwatchesProps) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <label key={color.value} title={color.name} className="relative cursor-pointer has-[:focus-visible]:rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
            <input type="radio" name={name} value={color.value} checked={value.toLowerCase() === color.value} onChange={() => onChange(color.value)} className="sr-only" />
            <span className="sr-only">{color.name}</span>
            <span aria-hidden="true" className={cn("flex h-8 w-8 items-center justify-center rounded-full border border-black/10", value.toLowerCase() === color.value && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ backgroundColor: color.value, color: readableTextOn(color.value) }}>
              {value.toLowerCase() === color.value && <Check className="h-4 w-4" />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

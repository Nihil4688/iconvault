// Form fields: a label, the control, an optional hint and an error, wired together with ids so screen readers announce them. All use native elements.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

type FieldShellProps = { id: string; label: string; hint?: string | undefined; error?: string | undefined; children: ReactNode };

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | undefined };

export function TextField({ label, hint, error, className, id: given, ...rest }: TextFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(CONTROL, "h-9 py-0", className)} {...rest} />
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | undefined };

export function TextAreaField({ label, hint, error, className, id: given, ...rest }: TextAreaFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(CONTROL, "min-h-20 resize-y", className)} {...rest} />
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | undefined; hideLabel?: boolean };

export function SelectField({ label, hint, error, hideLabel = false, className, id: given, children, ...rest }: SelectFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  const select = (
    <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(CONTROL, "h-9 py-0 pr-8", className)} {...rest}>
      {children}
    </select>
  );
  if (hideLabel) {
    return (
      <div>
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {select}
      </div>
    );
  }
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {select}
    </FieldShell>
  );
}

// Form fields: a label, the control, an optional hint and an error, wired together with ids so screen readers announce them. All use native elements.
import { ChevronDown } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { InfoIcon } from "../icons/icons";
import { RequiredIndicator } from "./RequiredIndicator";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#1555E0] focus:shadow-[0_0_0_3px_rgba(21,85,224,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70";

type FieldShellProps = { id: string; label: string; hint?: string | undefined; labelInfo?: string | undefined; error?: string | undefined; required?: boolean; children: ReactNode };

function FieldShell({ id, label, hint, labelInfo, error, required, children }: FieldShellProps) {
  return (
    <div>
      {labelInfo ? (
        <div className="mb-1.5 flex items-center gap-1.5">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}{required && <RequiredIndicator />}
          </label>
          <span className="group relative inline-flex items-center">
            <button type="button" aria-label={`${label} information`} aria-describedby={`${id}-label-info`} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring">
              <InfoIcon aria-hidden="true" className="h-4 w-4" />
            </button>
            <span id={`${id}-label-info`} role="tooltip" className="invisible absolute left-0 top-full z-50 w-max max-w-56 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-normal text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              {labelInfo}
            </span>
          </span>
        </div>
      ) : (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
          {label}{required && <RequiredIndicator />}
        </label>
      )}
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

function describedBy(id: string, hint?: string, error?: string, labelInfo?: string): string | undefined {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null, labelInfo ? `${id}-label-info` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | undefined };

export function TextField({ label, hint, error, className, id: given, ...rest }: TextFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(CONTROL, "h-9 py-0", className)} {...rest} />
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; labelInfo?: string; error?: string | undefined };

export function TextAreaField({ label, hint, labelInfo, error, className, id: given, ...rest }: TextAreaFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} labelInfo={labelInfo} error={error} required={rest.required}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error, labelInfo)} className={cn(CONTROL, "min-h-20 resize-y", className)} {...rest} />
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | undefined; hideLabel?: boolean };

export function SelectField({ label, hint, error, hideLabel = false, className, id: given, children, ...rest }: SelectFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  const select = (
    <div className="relative">
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(CONTROL, "h-9 appearance-none py-0 pr-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
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
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required}>
      {select}
    </FieldShell>
  );
}

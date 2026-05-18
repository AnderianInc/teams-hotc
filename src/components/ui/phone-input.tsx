import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizePhone, formatPhoneDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string | null | undefined;
  /** Receives the canonical E.164 value (or empty string), and a validity flag. */
  onChange: (e164: string, valid: boolean) => void;
  defaultCountry?: "US" | "CA" | "GB" | "NG";
  showError?: boolean;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, defaultCountry = "US", showError = true, className, onBlur, ...rest }, ref) => {
    const [display, setDisplay] = useState<string>(() =>
      value ? formatPhoneDisplay(value, value) : ""
    );
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      // Sync when value prop changes (e.g. dialog re-opens with new entry)
      if (value) {
        setDisplay(formatPhoneDisplay(value, value));
      } else if (!display) {
        setDisplay("");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDisplay(raw);
      setError(null);
      const res = normalizePhone(raw, defaultCountry);
      // Only push canonical value once it's valid; otherwise push empty so consumer knows it's not ready
      if (res.valid && res.e164) {
        onChange(res.e164, true);
      } else {
        // pass raw so form state stays in sync if needed, but mark invalid
        onChange(raw, false);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const res = normalizePhone(display, defaultCountry);
      if (display && !res.valid) {
        setError("Enter a valid phone number");
      } else if (res.valid && res.national) {
        setDisplay(res.national);
      }
      onBlur?.(e);
    };

    return (
      <div className="space-y-1">
        <Input
          ref={ref}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(error && "border-destructive", className)}
          {...rest}
        />
        {showError && error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

import { Eye, EyeOff, Lock } from "lucide-react";
import { forwardRef, useState } from "react";

import { Input, type InputProps } from "@/components/ui/Input";

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "trailing">>(
  ({ icon = Lock, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <Input
        ref={ref}
        type={isVisible ? "text" : "password"}
        icon={icon}
        trailing={
          <button
            type="button"
            onClick={() => setIsVisible((v) => !v)}
            aria-label={isVisible ? "Hide password" : "Show password"}
            className="flex size-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
          >
            {isVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordInput.displayName = "PasswordInput";

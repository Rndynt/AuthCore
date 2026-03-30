import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked = false, onCheckedChange, className, disabled, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-muted-foreground/30',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          className
        )}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onCheckedChange?.(!checked);
          props.onClick?.(event);
        }}
        ref={ref}
        {...props}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 translate-x-1 rounded-full bg-background shadow transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';

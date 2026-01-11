import React, { forwardRef, useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    /** Marks the field as required (adds visual indicator and aria-required) */
    required?: boolean;
    /** Helper text displayed below the input */
    helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, leftIcon, className = '', required, helperText, id: providedId, ...props }, ref) => {
        // Generate unique IDs for accessibility associations
        const generatedId = useId();
        const inputId = providedId || `input-${generatedId}`;
        const errorId = error ? `${inputId}-error` : undefined;
        const helperId = helperText ? `${inputId}-helper` : undefined;

        // Combine IDs for aria-describedby
        const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

        return (
            <div className="w-full">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="block text-sm font-medium text-white/70 mb-2"
                    >
                        {label}
                        {required && (
                            <span className="required-indicator" aria-hidden="true">*</span>
                        )}
                        {required && <span className="sr-only">(required)</span>}
                    </label>
                )}
                <div className="relative">
                    {leftIcon && (
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true">
                            {leftIcon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        className={`glass-input ${leftIcon ? 'pl-12' : ''} ${error ? 'border-red-400/50 focus:border-red-400' : ''
                            } ${className}`}
                        aria-required={required}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={describedBy}
                        {...props}
                    />
                </div>
                {helperText && !error && (
                    <p id={helperId} className="mt-1.5 text-sm text-white/50">
                        {helperText}
                    </p>
                )}
                {error && (
                    <p id={errorId} className="mt-1.5 text-sm text-red-400 error-message" role="alert">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;

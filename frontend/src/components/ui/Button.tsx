import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    'aria-label'?: string;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    className = '',
    disabled,
    type = 'button',
    onClick,
    'aria-label': ariaLabel,
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-300 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

    const variantStyles = {
        primary: 'glass-button',
        secondary: 'bg-white/10 hover:bg-white/20 border border-white/20 text-white',
        ghost: 'bg-transparent hover:bg-white/10 text-white/80 hover:text-white',
        danger: 'bg-red-500/80 hover:bg-red-500 border border-red-400/30 text-white',
    };

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-sm min-h-[36px]',
        md: 'px-5 py-2.5 text-sm min-h-[44px]',
        lg: 'px-6 py-3 text-base min-h-[52px]',
    };

    const isDisabled = disabled || isLoading;

    const motionProps: HTMLMotionProps<'button'> = {
        whileHover: isDisabled ? undefined : { scale: 1.02 },
        whileTap: isDisabled ? undefined : { scale: 0.98 },
    };

    return (
        <motion.button
            {...motionProps}
            className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            disabled={isDisabled}
            type={type}
            onClick={onClick}
            aria-disabled={isDisabled || undefined}
            aria-busy={isLoading || undefined}
            aria-label={ariaLabel}
        >
            {isLoading ? (
                <>
                    <div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"
                        role="status"
                        aria-label="Loading"
                    />
                    <span className="sr-only">Loading, please wait...</span>
                </>
            ) : leftIcon ? (
                <span className="mr-2" aria-hidden="true">{leftIcon}</span>
            ) : null}
            {children}
            {rightIcon && <span className="ml-2" aria-hidden="true">{rightIcon}</span>}
        </motion.button>
    );
};

export default Button;

import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    hover = false,
    onClick,
}) => {
    const baseStyles = 'glass-card p-6';

    // Handle keyboard Enter/Space for accessibility
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    };

    if (hover || onClick) {
        return (
            <motion.div
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={onClick ? { scale: 0.98 } : undefined}
                className={`${baseStyles} cursor-pointer ${className}`}
                onClick={onClick}
                // ADA accessibility: make clickable cards keyboard accessible
                tabIndex={onClick ? 0 : undefined}
                role={onClick ? 'button' : undefined}
                onKeyDown={onClick ? handleKeyDown : undefined}
            >
                {children}
            </motion.div>
        );
    }

    return (
        <div className={`${baseStyles} ${className}`}>
            {children}
        </div>
    );
};

export default Card;

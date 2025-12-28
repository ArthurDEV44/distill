import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { ButtonProps } from './Button.types';

const baseClasses =
  'group relative inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black';

const variants = {
  primary:
    'bg-white text-black hover:bg-neutral-200 focus:ring-white shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.5)]',
  secondary:
    'bg-black/40 text-neutral-300 border border-neutral-800 hover:text-white hover:border-tech-accent/50 hover:bg-tech-accent/5 focus:ring-tech-accent backdrop-blur-md',
};

const Button: React.FC<ButtonProps> = ({
  children,
  variant,
  icon,
  onClick,
  href,
}) => {
  const content = (
    <>
      {icon && (
        <span className="group-hover:text-current transition-colors">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {variant === 'primary' && (
        <ArrowRight
          className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 text-black/70 group-hover:text-black"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={`${baseClasses} ${variants[variant]}`}>
        {content}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variants[variant]}`}
    >
      {variant === 'primary' && (
        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent z-10" />
      )}
      {content}
    </button>
  );
};

export default Button;
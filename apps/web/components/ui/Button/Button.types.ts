import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  variant: 'primary' | 'secondary';
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
}
import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text' | 'icon';
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const style = { primary: 'primary', secondary: 'secondary', text: 'text-btn', icon: 'icon-btn' }[
    variant
  ];
  return <button type={type} className={`${style} ${className}`} {...props} />;
}

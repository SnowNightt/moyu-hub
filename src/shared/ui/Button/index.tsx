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
  const style = {
    primary: 'ui-button-primary',
    secondary: 'ui-button-secondary',
    text: 'ui-button-text',
    icon: 'ui-button-icon',
  }[variant];
  return <button type={type} className={`${style} ${className}`} {...props} />;
}

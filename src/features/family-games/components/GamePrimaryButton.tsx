import type { ButtonHTMLAttributes } from 'react'

// The one "Hrát" CTA style — big, filled, unmissable — shared by every
// Family Games entry screen instead of each game styling its own.
export function GamePrimaryButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`game-primary-button${className ? ` ${className}` : ''}`} {...rest} />
}

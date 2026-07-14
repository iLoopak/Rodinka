import type { ShoppingCategory } from '../../utils/shopping'

export function ShoppingCategoryIcon({ category }: { category: ShoppingCategory }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 } as const
  switch (category) {
    case 'produce': return <svg {...common} aria-hidden="true"><path d="M12 20c-4.5 0-7-3.3-7-7.2C5 9.4 7.4 7 10.5 7c.7 0 1.2.2 1.5.5.3-.3.8-.5 1.5-.5C16.6 7 19 9.4 19 12.8 19 16.7 16.5 20 12 20Z"/><path d="M12 7c0-2.2 1.2-3.5 3.5-4M12 6c-1.3-1.5-3-1.8-4.5-1" strokeLinecap="round"/></svg>
    case 'bakery': return <svg {...common} aria-hidden="true"><path d="M5 18c-2-3.5-.8-8.5 3-10.5 3.7-2 8.3-.8 10.5 2.5 2.2 3.4.8 7.7-2.8 9H7a2.3 2.3 0 0 1-2-1Z"/><path d="m9 9 2 2m2-4 2 2m-8 4 2 2" strokeLinecap="round"/></svg>
    case 'meat': return <svg {...common} aria-hidden="true"><path d="M18.5 5.5c2 2 1.4 5.8-1.5 8.7-2.2 2.2-5 3.1-7 2.5L7.7 19a2.5 2.5 0 1 1-3.5-3.5l2.4-2.3c-.6-2 .3-4.9 2.5-7 2.9-2.9 7-2.8 9.4-.7Z"/><circle cx="14" cy="9" r="2"/></svg>
    case 'dairy': return <svg {...common} aria-hidden="true"><path d="M8 4h8l1 4v12H7V8l1-4Z"/><path d="M8 8h9M10 4v4"/></svg>
    case 'household': return <svg {...common} aria-hidden="true"><path d="M4 11 12 4l8 7v9H4v-9Z" strokeLinejoin="round"/><path d="M9 20v-6h6v6"/></svg>
    case 'pharmacy': return <svg {...common} aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V4h6v3m-3 4v5m-2.5-2.5h5" strokeLinecap="round"/></svg>
    case 'other': return <svg {...common} aria-hidden="true"><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>
  }
}

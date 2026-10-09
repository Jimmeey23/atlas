import { forwardRef, type SelectHTMLAttributes } from 'react';

/** Shared dropdown field. Native selection preserves labels, keyboard navigation and mobile pickers. */
export const DropdownField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function DropdownField({ className = '', ...props }, ref) {
    return <select {...props} ref={ref} className={`atlas-dropdown ${className}`.trim()} />;
  },
);

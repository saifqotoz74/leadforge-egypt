import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export function Table({
  children,
  className = '',
  containerClassName = '',
  ...props
}: TableProps) {
  return (
    <div
      className={`w-full overflow-x-auto rounded-lg border border-line bg-surface ${containerClassName}`}
    >
      <table className={`w-full text-start border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`bg-subtle text-fg-secondary text-label font-medium border-b border-line ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-line text-body-sm ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isSelected?: boolean;
}

export function TableRow({
  children,
  isSelected = false,
  className = '',
  ...props
}: TableRowProps) {
  return (
    <tr
      className={`h-row transition-colors ${
        isSelected
          ? 'bg-brand-soft-strong text-brand'
          : 'hover:bg-brand-soft text-fg-primary'
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  isNumeric?: boolean;
}

export function TableHead({
  children,
  isNumeric = false,
  className = '',
  ...props
}: TableHeadProps) {
  return (
    <th
      scope="col"
      className={`h-11 px-4 font-medium select-none ${
        isNumeric ? 'text-end tabular-nums' : 'text-start'
      } ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  isNumeric?: boolean;
}

export function TableCell({
  children,
  isNumeric = false,
  className = '',
  ...props
}: TableCellProps) {
  return (
    <td
      className={`px-4 py-3 align-middle ${
        isNumeric ? 'text-end tabular-nums' : 'text-start'
      } ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

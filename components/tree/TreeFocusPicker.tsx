'use client';

import {useRouter} from 'next/navigation';
import {Select} from '@/components/ui';

export function TreeFocusPicker({
  options,
  value,
  label
}: {
  options: {id: string; name: string}[];
  value: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="whitespace-nowrap">{label}</span>
      <Select
        value={value}
        onChange={(event) => router.push(`/tree?focus=${event.target.value}`)}
        className="w-auto min-w-40"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

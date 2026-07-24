'use client';

import {useRouter} from 'next/navigation';
import {Select} from '@/components/ui';

export function PersonFilter({
  options,
  value,
  allLabel
}: {
  options: {id: string; name: string}[];
  value: string;
  allLabel: string;
}) {
  const router = useRouter();
  return (
    <Select
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        router.push(next ? `/photos?person=${next}` : '/photos');
      }}
      className="w-auto min-w-36"
      aria-label={allLabel}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </Select>
  );
}

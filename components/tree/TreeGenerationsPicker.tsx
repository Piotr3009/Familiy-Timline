'use client';

import {useRouter} from 'next/navigation';
import {Select} from '@/components/ui';
import type {TreeGenerations} from '@/lib/tree';

/**
 * "N generations" pill from the approved design. Navigation keeps the
 * current focus and partner filter so the three controls compose.
 */
export function TreeGenerationsPicker({
  value,
  focusId,
  partnerFilter,
  options
}: {
  value: TreeGenerations;
  focusId: string;
  partnerFilter: string;
  options: {value: TreeGenerations; label: string}[];
}) {
  const router = useRouter();
  return (
    <Select
      value={String(value)}
      aria-label={options.find((option) => option.value === value)?.label}
      onChange={(event) =>
        router.push(
          `/tree?focus=${focusId}&partners=${partnerFilter}&gens=${event.target.value}`
        )
      }
      className="w-auto rounded-full"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

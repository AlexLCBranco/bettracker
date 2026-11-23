'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { BatchView } from '@/components/pp/BatchView';

// BT-30: one PP batch: its legs (main view) and its tickets.
export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}>
      <BatchView id={id} />
    </Suspense>
  );
}

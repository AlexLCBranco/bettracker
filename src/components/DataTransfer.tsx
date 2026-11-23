'use client';

import { useRef, useState } from 'react';
import { BUILD_INFO } from '@/lib/build-info';
import { todayISO } from '@/lib/dates';
import { buildExport, toCSV } from '@/lib/transfer';
import { useApp } from './AppProvider';

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export all bets (JSON with everything, or CSV) and import a JSON export, which only adds bets not already here. */
export function DataTransfer({ vertical }: { vertical?: boolean } = {}) {
  const { bets, entries, batches, loaded, importExport, notify } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error(`${file.name} is not a JSON file`);
      }
      const { added, skipped } = await importExport(json);
      notify(`Imported ${added} ${added === 1 ? 'bet' : 'bets'}${skipped ? `; ${skipped} already here, left as they are` : ''}`);
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className={vertical ? "flex w-40 flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
      <button className="btn" disabled={!loaded} onClick={() => download(`bettracker-${todayISO()}.json`, 'application/json', JSON.stringify(buildExport(bets, BUILD_INFO.version, undefined, entries, batches), null, 2))} title="Everything, to keep as a backup or import later">
        Export JSON
      </button>
      <button className="btn" disabled={!loaded} onClick={() => download(`bettracker-bets-${todayISO()}.csv`, 'text/csv;charset=utf-8', toCSV(bets))} title="One row per bet, for a spreadsheet">
        Export CSV
      </button>
      <button className="btn" disabled={!loaded || busy} onClick={() => fileInput.current?.click()} title="Adds the bets from a JSON export that aren't here yet; never changes or deletes existing ones">
        {busy ? 'Importing…' : 'Import JSON'}
      </button>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Import file" onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  );
}

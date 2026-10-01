'use client';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  selectedIds: Set<string>;
  setSelectedIds: (value: Set<string>) => void;
  bulkDeleteConfirm: boolean;
  setBulkDeleteConfirm: (value: boolean) => void;
  bulkDeleting: boolean;
  handleBulkDelete: () => void;
  /** Archived orders (task 831a4461). */
  viewingArchive: boolean;
  archiving: boolean;
  archiveError: string;
  handleBulkArchive: (archived: boolean) => void;
}

export default function BulkSelectionToolbar({
  selectedIds, setSelectedIds, bulkDeleteConfirm, setBulkDeleteConfirm,
  bulkDeleting, handleBulkDelete,
  viewingArchive, archiving, archiveError, handleBulkArchive,
}: Props) {
  return (
    <>
          {/* Bulk selection toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-[10px] tracking-[0.15em] uppercase text-red-500">
                {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'} selected
              </p>
              {bulkDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-500">Delete permanently? This cannot be undone.</span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="bg-red-500 text-white text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {bulkDeleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={() => setBulkDeleteConfirm(false)}
                    disabled={bulkDeleting}
                    className="border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[9px] tracking-[0.18em] uppercase text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Clear
                  </button>
                  {/* Moving to the archive, and back out of it (task 831a4461). First, and in
                      the ordinary button style, because it is the everyday action here and it
                      loses nothing. Delete stays where it was, still the only red one. */}
                  <button
                    onClick={() => handleBulkArchive(!viewingArchive)}
                    disabled={archiving}
                    className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50"
                  >
                    {archiving
                      ? 'Moving…'
                      : viewingArchive ? 'Bring back to orders' : 'Move to archived orders'}
                  </button>
                  <button
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="border border-red-300 text-red-500 text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-100 transition-colors"
                  >
                    Delete Selected
                  </button>
                </div>
              )}
              {archiveError && (
                <p className="w-full text-[10px] text-red-600 font-semibold">{archiveError}</p>
              )}
            </div>
          )}
    </>
  );
}

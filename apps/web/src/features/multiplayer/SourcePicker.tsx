/**
 * Artist-or-category chooser shared by room creation and the "race something else" flow on the
 * results screen. Extracted so the post-game switch offers exactly the same choices as the
 * lobby did — a second, drifting copy of this list is how the two ended up disagreeing about
 * which categories exist.
 */
import { useEffect, useState } from 'react';
import { ArtistSearchInput } from '../artist/ArtistSearchInput';
import { getCategories } from '../../api/categories';
import type { ArtistSearchResult, Category } from '../../types/api';

/** What a room races over. Rooms accept either; the game is identical. */
export type SourceKind = 'artist' | 'category';

export type PickedSource =
  { kind: 'artist'; artist: ArtistSearchResult } | { kind: 'category'; category: Category };

interface SourcePickerProps {
  value: PickedSource | null;
  onChange: (source: PickedSource | null) => void;
  /** Caps the category grid's height. The results screen has less room than the home page. */
  compact?: boolean;
}

export function SourcePicker({ value, onChange, compact = false }: SourcePickerProps) {
  const [kind, setKind] = useState<SourceKind>(value?.kind ?? 'artist');
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetched lazily: someone racing over an artist never needs the category list.
  useEffect(() => {
    if (kind !== 'category' || categories.length > 0) return;
    getCategories()
      .then(setCategories)
      .catch(() => setError('Could not load categories.'));
  }, [kind, categories.length]);

  const selectedCategoryId = value?.kind === 'category' ? value.category.id : null;

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        role="tablist"
        aria-label="What to race over"
        className="flex w-full gap-1.5 rounded-xl border border-white/5 bg-chorusify-bg/80 p-1.5"
      >
        {(
          [
            ['artist', 'An artist'],
            ['category', 'A category'],
          ] as [SourceKind, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              onChange(null);
            }}
            className={
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ' +
              (kind === k
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {kind === 'artist' ? (
        <ArtistSearchInput onSelect={(artist) => onChange({ kind: 'artist', artist })} />
      ) : (
        <div
          className={`glass grid w-full grid-cols-2 gap-2 overflow-y-auto rounded-2xl p-3 sm:grid-cols-3 ${
            compact ? 'max-h-44' : 'max-h-64'
          }`}
        >
          {error && (
            <p className="col-span-full py-4 text-center text-sm text-slate-400">{error}</p>
          )}
          {!error && categories.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-slate-400">
              Loading categories…
            </p>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ kind: 'category', category: c })}
              aria-pressed={selectedCategoryId === c.id}
              className={
                'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all ' +
                (selectedCategoryId === c.id
                  ? 'border-chorusify-accent/60 bg-chorusify-accent/15 text-white'
                  : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]')
              }
            >
              <span className="block truncate">{c.label}</span>
              {/* Only shown where somebody actually is — a row of zeroes would just say
                  "nobody is anywhere", which is worse than saying nothing. */}
              {(c.playing ?? 0) + (c.queued ?? 0) > 0 && (
                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  {(c.playing ?? 0) + (c.queued ?? 0)} here
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

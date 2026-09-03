/**
 * Artist-or-category chooser shared by room creation and the "race something else" flow on the
 * results screen. Extracted so the post-game switch offers exactly the same choices as the
 * lobby did — a second, drifting copy of this list is how the two ended up disagreeing about
 * which categories exist.
 */
import { useEffect, useState } from 'react';
import { ArtistSearchInput } from '../artist/ArtistSearchInput';
import { getCategories } from '../../api/categories';
import { getMovieCollections } from '../../api/movies';
import type { ArtistSearchResult, Category, MovieCollection } from '../../types/api';

/**
 * What a room races over. The game is identical for all three; only the pool differs.
 *
 * Movies are a separate kind rather than a category even though the server resolves them
 * through the same source, because they are a separate mode to a player — mixing four film
 * collections into a list of seventy-two categories is how they got lost in the first place.
 */
export type SourceKind = 'artist' | 'category' | 'movie';

export type PickedSource =
  | { kind: 'artist'; artist: ArtistSearchResult }
  | { kind: 'category'; category: Category }
  | { kind: 'movie'; collection: MovieCollection };

interface SourcePickerProps {
  value: PickedSource | null;
  onChange: (source: PickedSource | null) => void;
  /** Caps the category grid's height. The results screen has less room than the home page. */
  compact?: boolean;
  /**
   * Opens on the Movie tab with this collection already chosen. Set from `?movieId=` so the
   * "Multiplayer" and "Duel" buttons on the Guess the Movie page land somewhere useful instead
   * of dropping the player on an artist search with their choice forgotten.
   */
  preselectMovieId?: string;
}

export function SourcePicker({
  value,
  onChange,
  compact = false,
  preselectMovieId,
}: SourcePickerProps) {
  const [kind, setKind] = useState<SourceKind>(
    preselectMovieId ? 'movie' : (value?.kind ?? 'artist'),
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [movies, setMovies] = useState<MovieCollection[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetched lazily, per tab: someone racing over an artist never needs either list.
  useEffect(() => {
    if (kind !== 'category' || categories.length > 0) return;
    getCategories()
      // Movie collections come back from /categories too (they are browsable there), but this
      // picker has its own Movie tab. Choosing one from the Category tab would queue a duel on
      // the category rating ladder instead of the movie one, so they are filtered out here.
      .then((all) => setCategories(all.filter((c) => c.group !== 'movie')))
      .catch(() => setError('Could not load categories.'));
  }, [kind, categories.length]);

  useEffect(() => {
    if (kind !== 'movie' || movies.length > 0) return;
    getMovieCollections()
      .then(setMovies)
      .catch(() => setError('Could not load movie collections.'));
  }, [kind, movies.length]);

  /* Runs once the list arrives rather than on mount, because the collection object itself is
     what the caller needs — an id alone cannot fill in the label the confirm button shows. */
  useEffect(() => {
    if (!preselectMovieId || value != null) return;
    const match = movies.find((m) => m.id === preselectMovieId);
    if (match) onChange({ kind: 'movie', collection: match });
  }, [preselectMovieId, movies, value, onChange]);

  const selectedId =
    value?.kind === 'category'
      ? value.category.id
      : value?.kind === 'movie'
        ? value.collection.id
        : null;

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        role="tablist"
        aria-label="What to race over"
        className="flex w-full gap-1.5 rounded-xl border border-white/5 bg-chorusify-bg/80 p-1.5"
      >
        {(
          [
            ['artist', 'Artist'],
            ['category', 'Category'],
            ['movie', 'Movie'],
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
          {!error && (kind === 'category' ? categories : movies).length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-slate-400">Loading…</p>
          )}
          {(kind === 'category'
            ? categories.map((c) => ({
                id: c.id,
                // Every movie collection is prefixed "Guess the Movie:", which in a two-column
                // grid pushes the only distinguishing word out of view.
                label: c.label,
                here: (c.playing ?? 0) + (c.queued ?? 0),
                pick: () => onChange({ kind: 'category' as const, category: c }),
              }))
            : movies.map((m) => ({
                id: m.id,
                label: m.label.replace(/^Guess the Movie:\s*/, ''),
                here: (m.playing ?? 0) + (m.queued ?? 0),
                pick: () => onChange({ kind: 'movie' as const, collection: m }),
              }))
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.pick}
              aria-pressed={selectedId === item.id}
              className={
                'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all ' +
                (selectedId === item.id
                  ? 'border-chorusify-accent/60 bg-chorusify-accent/15 text-white'
                  : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]')
              }
            >
              <span className="block truncate">{item.label}</span>
              {/* Only shown where somebody actually is — a row of zeroes would just say
                  "nobody is anywhere", which is worse than saying nothing. */}
              {item.here > 0 && (
                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  {item.here} here
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

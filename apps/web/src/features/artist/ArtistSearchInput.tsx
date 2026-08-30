import { useEffect, useRef, useState } from 'react';
import { searchArtists } from '../../api/artists';
import type { ArtistSearchResult } from '../../types/api';

interface ArtistSearchInputProps {
  onSelect: (artist: ArtistSearchResult) => void;
}

export function ArtistSearchInput({ onSelect }: ArtistSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtistSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectedNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (query === lastSelectedNameRef.current) {
      return;
    }
    lastSelectedNameRef.current = null;

    debounceRef.current = setTimeout(async () => {
      const matches = await searchArtists(query);
      setResults(matches);
      setOpen(matches.length > 0);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const select = (artist: ArtistSearchResult) => {
    lastSelectedNameRef.current = artist.name;
    onSelect(artist);
    setQuery(artist.name);
    setOpen(false);
  };

  return (
    /* Width is the parent's call, not this component's. The `max-w-md` that used to live here
       capped the field at 448px while every sibling — the artist/category tabs, the join-room
       card — filled the page's `max-w-xl`, so the search bar sat visibly narrower than the
       column it belongs to and stopped stretching on desktop. */
    <div className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(results.length > 0)}
          placeholder="zayn, taylor, drake..."
          className="w-full rounded-full border border-white/10 bg-[#26262a] px-6 py-3.5 pr-12 text-slate-100 placeholder-slate-500 outline-none ring-0 transition-all focus:border-white/30 focus:ring-2 focus:ring-white/10"
        />
        <div className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {open && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/15 bg-[#1c1c20] shadow-2xl backdrop-blur-xl">
          {results.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => select(artist)}
                className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
              >
                {artist.pictureUrl ? (
                  <img
                    src={artist.pictureUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-white/20 shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center text-slate-300 text-lg flex-shrink-0">
                    🎤
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-semibold text-white text-base">{artist.name}</span>
                  <span className="text-xs text-slate-400">Artist</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

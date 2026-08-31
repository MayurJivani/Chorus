import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getCategories } from '../api/categories';
import { usePageTitle } from '../hooks/usePageTitle';
import type { Category, CategoryGroup } from '../types/api';

const GROUP_LABELS: Record<CategoryGroup, { title: string; subtitle: string }> = {
  now: { title: 'Right Now', subtitle: "Live charts and this year's biggest tracks" },
  year: {
    title: 'By Year',
    subtitle: 'Decades with 200+ songs, plus individual years back to 2000',
  },
  genre: { title: 'By Genre', subtitle: 'Pop, rock, rap, K-pop and more' },
  bollywood: { title: 'Bollywood', subtitle: 'Hindi film music, romance, and party anthems' },
  world: {
    title: 'Around the World',
    subtitle: 'K-pop, Latin, Afrobeats, Tamil and Punjabi',
  },
  movie: {
    title: 'Guess the Movie',
    subtitle: 'Hear a song, name the film it came from',
  },
};

const GROUP_ORDER: CategoryGroup[] = ['movie', 'now', 'year', 'bollywood', 'world', 'genre'];

const FILTERS: [CategoryGroup | 'all', string][] = [
  ['all', 'All'],
  ['movie', 'Movies'],
  ['now', 'Charts'],
  ['bollywood', 'Bollywood'],
  ['year', 'Years'],
  ['world', 'Around the World'],
  ['genre', 'Genres'],
];

export function CategoryPickerPage() {
  usePageTitle('Categories');
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [filter, setFilter] = useState<CategoryGroup | 'all'>('all');

  useEffect(() => {
    getCategories()
      .then((res) => {
        setCategories(res);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, []);

  const grouped = useMemo(() => {
    const byGroup = new Map<CategoryGroup, Category[]>();
    for (const category of categories) {
      const bucket = byGroup.get(category.group) ?? [];
      bucket.push(category);
      byGroup.set(category.group, bucket);
    }
    return byGroup;
  }, [categories]);

  const startGame = (mode: 'search' | 'choice') => {
    if (!selected) return;
    navigate(`/category/${encodeURIComponent(selected.id)}/play?guessMode=${mode}`);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center gap-5 px-4 py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-1 text-center"
      >
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Categories</h1>
        <p className="text-sm text-slate-500">
          Ten songs from one era, chart, genre — or name the film they came from
        </p>
      </motion.div>

      {loading && <p className="text-sm text-slate-400">Loading categories…</p>}

      {failed && (
        <p className="text-sm text-chorusify-danger">
          Couldn't load the categories. Please refresh and try again.
        </p>
      )}

      {!loading && !failed && (
        <div
          role="tablist"
          aria-label="Filter categories"
          className="flex w-full flex-wrap justify-center gap-1.5 rounded-xl border border-white/5 bg-chorusify-bg/80 p-1.5"
        >
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ' +
                (filter === value
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white')
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!loading &&
        !failed &&
        GROUP_ORDER.filter((group) => filter === 'all' || filter === group).map((group) => {
          const items = grouped.get(group);
          if (!items || items.length === 0) return null;
          return (
            <section key={group} className="w-full flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                  {GROUP_LABELS[group].title}
                </h2>
                <p className="text-xs text-slate-500">{GROUP_LABELS[group].subtitle}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelected(category)}
                    aria-pressed={selected?.id === category.id}
                    className={
                      'rounded-xl border px-3 py-3 text-left transition-all duration-200 active:scale-[0.97] ' +
                      (selected?.id === category.id
                        ? 'border-chorusify-accent/60 bg-chorusify-accent/15 text-white shadow-sm'
                        : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white')
                    }
                  >
                    <span className="block text-sm font-semibold">{category.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {category.blurb}
                    </span>
                    {/* Shown only where somebody is: a grid of "0 here" reads as a dead game. */}
                    {(category.playing ?? 0) + (category.queued ?? 0) > 0 && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        {(category.playing ?? 0) + (category.queued ?? 0)} playing now
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass sticky bottom-4 w-full rounded-2xl border border-white/10 p-4 flex flex-col gap-3"
        >
          <p className="text-base font-bold text-white">{selected.label}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => startGame('search')}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.97]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4 text-slate-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
              Type to search
            </button>
            <button
              type="button"
              onClick={() => startGame('choice')}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.97]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4 text-slate-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
              Multiple choice
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

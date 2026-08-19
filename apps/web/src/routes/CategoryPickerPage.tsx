import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getCategories } from '../api/categories';
import type { Category, CategoryGroup } from '../types/api';

const GROUP_LABELS: Record<CategoryGroup, { title: string; subtitle: string }> = {
  now: { title: 'Right Now', subtitle: 'Live charts and this year’s biggest tracks' },
  year: { title: 'By Year', subtitle: 'The songs that defined each year, back to 2000' },
  genre: { title: 'By Genre', subtitle: 'Pop, rock, rap, K-pop and more' },
};

const GROUP_ORDER: CategoryGroup[] = ['now', 'year', 'genre'];

/** Filter chips. Genres exist but were unreachable in practice: they sit below twenty-four year
 *  cards, so on a phone nobody scrolled far enough to discover the mode had them at all. */
const FILTERS: [CategoryGroup | 'all', string][] = [
  ['all', 'All'],
  ['now', 'Charts'],
  ['year', 'Years'],
  ['genre', 'Genres'],
];

export function CategoryPickerPage() {
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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center gap-6 px-4 py-4 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Pick a Category</h1>
        <p className="max-w-md text-slate-400 text-sm">
          Ten songs from one era, chart or genre. Every track by a different artist.
        </p>
      </motion.div>

      {loading && <p className="text-sm text-slate-400">Loading categories…</p>}

      {failed && (
        <p className="text-sm text-chorus-danger">
          Couldn’t load the categories. Please refresh and try again.
        </p>
      )}

      {!loading && !failed && (
        <div
          role="tablist"
          aria-label="Filter categories"
          className="flex w-full flex-wrap justify-center gap-1.5 rounded-xl border border-white/5 bg-chorus-bg/80 p-1.5"
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
                        ? 'border-chorus-accent/60 bg-chorus-accent/15 text-white shadow-sm'
                        : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white')
                    }
                  >
                    <span className="block text-sm font-semibold">{category.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {category.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

      {/* Pinned so the chosen category and the start buttons stay together however far the
          player has scrolled through the list. */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass sticky bottom-4 w-full rounded-2xl border border-white/10 p-4 flex flex-col gap-3"
        >
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Selected</p>
            <p className="text-lg font-bold text-white">{selected.label}</p>
          </div>
          <div className="flex rounded-xl bg-chorus-bg/80 p-1.5 gap-1.5 border border-white/5">
            <ModeButton onClick={() => startGame('search')}>Type to search</ModeButton>
            <ModeButton onClick={() => startGame('choice')}>Multiple choice</ModeButton>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ModeButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

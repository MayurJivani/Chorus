import { motion } from 'framer-motion';
import type {
  MultiplayerRoomSnapshot,
  MultiplayerScoreEntry,
  SongSearchResult,
} from '../../types/api';
import { SnippetPlayer } from '../game/SnippetPlayer';
import { SnippetProgressBar } from '../game/SnippetProgressBar';
import { GuessInput } from '../game/GuessInput';
import { MultipleChoiceGuess } from '../artist/MultipleChoiceGuess';
import { MultiplayerScoreboard } from './MultiplayerScoreboard';
import type {
  MultiplayerGuessResult,
  MultiplayerRound,
  MultiplayerRoundEnd,
} from './useMultiplayerGame';
import { useCountdownTo } from './useCountdownTo';

interface MultiplayerGameProps {
  room: MultiplayerRoomSnapshot;
  selfId: string | null;
  round: MultiplayerRound;
  stageIndex: number;
  roundEnd: MultiplayerRoundEnd | null;
  scores: MultiplayerScoreEntry[];
  lastGuess: MultiplayerGuessResult | null;
  searchFn: (query: string) => Promise<SongSearchResult[]>;
  onSubmitGuess: (trackId: string) => void;
  onReveal: () => void;
  onNextRound: () => void;
}

export function MultiplayerGame({
  room,
  selfId,
  round,
  stageIndex,
  roundEnd,
  scores,
  lastGuess,
  searchFn,
  onSubmitGuess,
  onReveal,
  onNextRound,
}: MultiplayerGameProps) {
  const isHost = selfId === room.hostId;
  const you = room.players.find((p) => p.playerId === selfId);
  const answered = you?.roundAnswered ?? false;

  const clampedStage = Math.min(stageIndex, round.snippetSchedule.length - 1);
  const stageSeconds = round.snippetSchedule[clampedStage] ?? 1;
  const atMaxStage = clampedStage >= round.snippetSchedule.length - 1;
  const nextSeconds = round.snippetSchedule[clampedStage + 1];
  const roundEndsAt = round.startedAt + round.roundDurationMs;
  const nextRoundAt = roundEndsAt + round.revealDurationMs;
  const secondsLeft = useCountdownTo(roundEnd ? nextRoundAt : roundEndsAt);

  const handleGuess = (song: SongSearchResult) => onSubmitGuess(String(song.id));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-4 sm:gap-6 px-4 py-4 sm:py-8">
      <div className="glass flex w-full flex-col items-center gap-4 rounded-2xl p-4 sm:p-6">
        {/* Header */}
        <div className="flex w-full flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold text-white">{room.artistName}</h1>
          <p className="font-mono text-xs text-slate-500">
            Song {round.roundIndex + 1} of {round.totalRounds} ·{' '}
            {roundEnd ? 'next round in' : 'round ends in'}{' '}
            <span className="font-semibold text-slate-300">{secondsLeft}s</span>
          </p>
        </div>

        {roundEnd ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full flex-col items-center gap-5 text-center"
          >
            <h2 className="text-lg font-bold text-white">🎵 It was…</h2>
            <div className="flex w-full max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              {roundEnd.correct?.albumArtUrl ? (
                <img
                  src={roundEnd.correct.albumArtUrl}
                  alt=""
                  className="h-14 w-14 flex-shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/10"
                />
              ) : (
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
                  🎵
                </div>
              )}
              <div className="min-w-0 text-left">
                <p className="truncate text-base font-bold text-white">
                  {roundEnd.correct?.title ?? 'Unknown'}
                </p>
                <p className="truncate text-xs text-slate-400">{roundEnd.correct?.artist ?? ''}</p>
              </div>
            </div>

            <p className="text-sm text-slate-400">
              Next round in <span className="font-semibold text-slate-200">{secondsLeft}s</span>
            </p>
            {isHost && (
              <button type="button" onClick={onNextRound} className="btn-ghost w-full !rounded-xl">
                Skip reveal →
              </button>
            )}
          </motion.div>
        ) : (
          <>
            <SnippetProgressBar stageIndex={stageIndex} />

            <SnippetPlayer
              previewUrl={round.previewUrl}
              stageSeconds={stageSeconds}
              playSignal={stageIndex + 1}
              fixedOffsetSeconds={0}
              artistPictureUrl={round.artistPictureUrl}
            />

            <button
              type="button"
              onClick={onReveal}
              disabled={answered || atMaxStage}
              className="btn-ghost w-full max-w-md !rounded-xl"
            >
              {atMaxStage
                ? 'Full snippet revealed. Go on, guess!'
                : `Reveal more audio → ${nextSeconds}s`}
            </button>

            {answered ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex w-full max-w-md flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                {lastGuess?.correct ? (
                  <>
                    <p className="text-lg font-bold text-emerald-400">
                      Locked in! +{lastGuess.points}
                    </p>
                    <p className="text-xs text-slate-400">
                      Now wait for the reveal, no changing it!
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-chorus-danger">Not that one</p>
                    <p className="text-xs text-slate-400">You&apos;re done for this round.</p>
                  </>
                )}
              </motion.div>
            ) : round.options && round.options.length > 0 ? (
              /* Choice mode: everyone in the room is offered the same three answers, so the
                 round stays a race on recognition rather than on typing speed. */
              <MultipleChoiceGuess
                options={round.options}
                onGuess={handleGuess}
                onSkip={() => onSubmitGuess('__pass__')}
              />
            ) : (
              <GuessInput
                onGuess={handleGuess}
                onSkip={() => onSubmitGuess('__pass__')}
                searchFn={searchFn}
              />
            )}
          </>
        )}
      </div>

      <MultiplayerScoreboard
        scores={scores}
        selfId={selfId}
        hostId={room.hostId}
        showRoundState
        title="Live standings"
      />
    </div>
  );
}

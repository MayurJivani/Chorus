import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { searchArtistTracks } from '../api/artists';
import { searchCategoryTracks } from '../api/categories';
import { useMultiplayerGame } from '../features/multiplayer/useMultiplayerGame';
import { MultiplayerLobby } from '../features/multiplayer/MultiplayerLobby';
import { MultiplayerGame } from '../features/multiplayer/MultiplayerGame';
import { MultiplayerResults } from '../features/multiplayer/MultiplayerResults';

export function MultiplayerRoomPage() {
  const { code: codeParam } = useParams<{ code: string }>();
  const code = (codeParam ?? '').toUpperCase();
  const navigate = useNavigate();
  const location = useLocation();
  const autoJoin = location.state?.autoJoin === true;
  const [name, setName] = useState('');
  // `null` = not joined yet (the pre-join screen asks for a name); a string = join with it.
  const [nickname, setNickname] = useState<string | null>(autoJoin ? '' : null);

  const {
    connectionStatus,
    room,
    selfId,
    round,
    stageIndex,
    roundEnd,
    gameOver,
    scores,
    lastGuess,
    error,
    startGame,
    reveal,
    submitGuess,
    nextRound,
    leave,
  } = useMultiplayerGame(code, nickname);

  // The typeahead has to search whatever the room races over, not always an artist.
  const sourceType = room?.sourceType;
  const sourceId = room?.sourceId;
  const searchRoomTracks = useCallback(
    (query: string) => {
      if (!sourceId) return Promise.resolve([]);
      return sourceType === 'category'
        ? searchCategoryTracks(sourceId, query)
        : searchArtistTracks(Number(sourceId), query, false);
    },
    [sourceType, sourceId],
  );

  const handleLeave = useCallback(() => {
    leave();
    navigate('/multiplayer');
  }, [leave, navigate]);

  // Pre-join: ask for a name (optional) before opening the socket.
  if (nickname === null) {
    return (
      <Centered>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setNickname(name.trim());
          }}
          className="glass flex w-full max-w-md flex-col items-center gap-4 rounded-2xl p-6 text-center"
        >
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm text-slate-400">You&apos;re joining room</p>
            <p className="font-mono text-3xl font-black tracking-[0.25em] text-chorus-accent2">
              {code}
            </p>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder="Your name (optional)"
            aria-label="Your name"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white outline-none placeholder:text-slate-600 focus:border-chorus-accent2"
          />
          <button type="submit" className="btn-primary w-full !rounded-xl">
            Join room →
          </button>
        </form>
      </Centered>
    );
  }

  // The server only lets you into a room while it's in the lobby — a dropped socket during
  // the game means you're out, so show that honestly instead of a broken spinner.
  if (connectionStatus === 'closed' && room && room.phase !== 'lobby') {
    return (
      <Centered>
        <div className="glass flex max-w-md flex-col items-center gap-4 rounded-2xl p-6 text-center">
          <p className="text-2xl">📡</p>
          <h1 className="text-lg font-bold text-white">Lost connection</h1>
          <p className="text-sm text-slate-400">
            The game was already in progress, so the server couldn&apos;t put you back in the room.
            Spectate-free for now.
          </p>
          <Link to="/multiplayer" className="btn-primary w-full !rounded-xl">
            Back to multiplayer
          </Link>
        </div>
      </Centered>
    );
  }

  if (gameOver && room) {
    return (
      <MultiplayerResults
        gameOver={gameOver}
        selfId={selfId}
        label={room.label}
        canPlayAgain={selfId === room.hostId}
        onPlayAgain={startGame}
        onLeave={handleLeave}
      />
    );
  }

  if (round && room && connectionStatus !== 'closed') {
    return (
      <MultiplayerGame
        room={room}
        selfId={selfId}
        round={round}
        stageIndex={stageIndex}
        roundEnd={roundEnd}
        scores={scores}
        lastGuess={lastGuess}
        searchFn={searchRoomTracks}
        onSubmitGuess={submitGuess}
        onReveal={reveal}
        onNextRound={nextRound}
        onLeave={handleLeave}
      />
    );
  }

  if (room && connectionStatus !== 'closed') {
    return (
      <MultiplayerLobby room={room} selfId={selfId} onStart={startGame} onLeave={handleLeave} />
    );
  }

  if (error) {
    return (
      <Centered>
        <div className="glass flex max-w-md flex-col items-center gap-4 rounded-2xl p-6 text-center">
          <p className="text-2xl">🤔</p>
          <h1 className="text-lg font-bold text-white">Can&apos;t join this room</h1>
          <p className="text-sm text-slate-400">{error}</p>
          <Link to="/multiplayer" className="btn-primary w-full !rounded-xl">
            Back to multiplayer
          </Link>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-chorus-accent2" />
        <p className="font-mono text-sm">Joining room {code}…</p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full items-center justify-center px-4">{children}</div>;
}

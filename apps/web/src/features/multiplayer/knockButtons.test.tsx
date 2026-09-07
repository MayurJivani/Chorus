import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { KnockAnnounceButton } from './KnockAnnounceButton';
import { KnockListenButton } from './KnockListenButton';
import { listenForRoom } from './knockJoin';

vi.mock('./knockJoin', async (orig) => ({
  ...(await orig<typeof import('./knockJoin')>()),
  listenForRoom: vi.fn(),
}));

const config = { snippetSchedule: [2, 4], maxGuesses: 2, challengeRounds: 10 };
let knockJoinEnabled = false;
let knockJoinJingle = false;

vi.mock('../../hooks/useGameConfig', () => ({
  useGameConfig: () => ({ ...config, knockJoinEnabled, knockJoinJingle }),
}));

beforeEach(() => {
  knockJoinEnabled = false;
  knockJoinJingle = false;
});

describe('join-by-sound visibility', () => {
  it('shows nothing at all while the Beta is off', () => {
    // The default. Nobody is offered a microphone prompt for a feature the room is not using.
    const host = render(<KnockAnnounceButton code="ESXT2B" />);
    expect(host.container.firstChild).toBeNull();

    const joiner = render(<KnockListenButton onCode={vi.fn()} />);
    expect(joiner.container.firstChild).toBeNull();
  });

  it('gives the host an announce button once an admin turns it on', () => {
    knockJoinEnabled = true;
    render(<KnockAnnounceButton code="ESXT2B" />);
    expect(screen.getByRole('button', { name: /announce this room by sound/i })).toBeTruthy();
  });

  it('gives the joiner a listen button once an admin turns it on', () => {
    knockJoinEnabled = true;
    render(<KnockListenButton onCode={vi.fn()} />);
    expect(screen.getByRole('button', { name: /listen for a room nearby/i })).toBeTruthy();
  });

  it('tells the host which variant is playing, since one of them is inaudible', () => {
    knockJoinEnabled = true;
    const silent = render(<KnockAnnounceButton code="ESXT2B" />);
    expect(silent.getByText(/silent — above hearing/i)).toBeTruthy();

    knockJoinJingle = true;
    const chime = render(<KnockAnnounceButton code="ESXT2B" />);
    expect(chime.getByText(/plays a short chime/i)).toBeTruthy();
  });

  it('marks both as Beta', () => {
    knockJoinEnabled = true;
    render(<KnockAnnounceButton code="ESXT2B" />);
    render(<KnockListenButton onCode={vi.fn()} />);
    expect(screen.getAllByText('Beta')).toHaveLength(2);
  });
});

describe('why listening failed', () => {
  it('blames the microphone only when the microphone is the problem', async () => {
    knockJoinEnabled = true;
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    vi.mocked(listenForRoom).mockRejectedValueOnce(err);

    render(<KnockListenButton onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/microphone permission needed/i)).toBeTruthy());
  });

  it('says something else when permission was fine and the audio graph failed', async () => {
    // The real Android report: permission granted, then the AudioWorklet blocked by CSP.
    // Reporting that as "microphone unavailable" sent people to re-check a setting that was
    // already correct.
    knockJoinEnabled = true;
    const err = new Error('CSP');
    err.name = 'SecurityError';
    vi.mocked(listenForRoom).mockRejectedValueOnce(err);

    render(<KnockListenButton onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/audio setup failed/i)).toBeTruthy());
    expect(screen.queryByText(/microphone permission/i)).toBeNull();
  });
});

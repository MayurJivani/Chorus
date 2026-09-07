import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KnockAnnounceButton } from './KnockAnnounceButton';
import { KnockListenButton } from './KnockListenButton';

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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevealMoreButton } from './RevealMoreButton';

describe('RevealMoreButton', () => {
  it('says nothing about cost when hearing more is free', () => {
    // The reassurance used to sit under every reveal for a whole run. The button no longer
    // looks like Skip, so it was noise rather than information.
    render(<RevealMoreButton onRevealMore={vi.fn()} currentSeconds={2} nextSeconds={4} />);

    expect(screen.getByText(/Hear more/)).toBeTruthy();
    expect(screen.queryByText(/no guess used/i)).toBeNull();
    expect(screen.queryByText(/free/i)).toBeNull();
  });

  it('still warns where hearing more spends an attempt', () => {
    // The daily puzzle, where advancing the snippet *is* the guess. Silence there would teach
    // the wrong rule on most players' first screen.
    render(
      <RevealMoreButton onRevealMore={vi.fn()} currentSeconds={2} nextSeconds={4} costsGuess />,
    );

    expect(screen.getByText('Uses one attempt')).toBeTruthy();
  });

  it('shows how much more audio the press buys', () => {
    render(<RevealMoreButton onRevealMore={vi.fn()} currentSeconds={4} nextSeconds={8} />);
    expect(screen.getByText('Hear more (+4s)')).toBeTruthy();
  });
});

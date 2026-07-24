import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuessInput } from './GuessInput';
import * as songsApi from '../../api/songs';

vi.mock('../../api/songs');

describe('GuessInput', () => {
  beforeEach(() => {
    vi.mocked(songsApi.searchSongs).mockResolvedValue([
      { id: 1, title: 'Bohemian Rhapsody', artist: 'Queen', albumArtUrl: null },
      { id: 2, title: 'Under Pressure', artist: 'Queen', albumArtUrl: null },
    ]);
  });

  it('shows matching results after typing and calls onGuess when one is selected', async () => {
    const user = userEvent.setup();
    const onGuess = vi.fn();
    render(<GuessInput onGuess={onGuess} onSkip={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/guess the song/i), 'Queen');

    const option = await screen.findByText('Bohemian Rhapsody');
    await user.click(option);

    expect(onGuess).toHaveBeenCalledWith({
      id: 1,
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      albumArtUrl: null,
    });
  });

  it('clears the input after a selection', async () => {
    const user = userEvent.setup();
    render(<GuessInput onGuess={vi.fn()} onSkip={vi.fn()} />);

    const input = screen.getByPlaceholderText(/guess the song/i) as HTMLInputElement;
    await user.type(input, 'Queen');
    const option = await screen.findByText('Under Pressure');
    await user.click(option);

    await waitFor(() => expect(input.value).toBe(''));
  });

  it('calls onSkip when the skip button is clicked', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<GuessInput onGuess={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('disables the input and skip button when disabled', () => {
    render(<GuessInput onGuess={vi.fn()} onSkip={vi.fn()} disabled />);

    expect(screen.getByPlaceholderText(/guess the song/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip/i })).toBeDisabled();
  });
});

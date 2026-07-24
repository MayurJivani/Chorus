import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultipleChoiceGuess } from './MultipleChoiceGuess';

const options = [
  { deezerTrackId: 'dz-1', title: 'Bohemian Rhapsody', artist: 'Queen' },
  { deezerTrackId: 'dz-2', title: 'Under Pressure', artist: 'Queen' },
  { deezerTrackId: 'dz-3', title: "Don't Stop Me Now", artist: 'Queen' },
];

describe('MultipleChoiceGuess', () => {
  it('renders all three options', () => {
    render(<MultipleChoiceGuess options={options} onGuess={vi.fn()} onSkip={vi.fn()} />);

    for (const option of options) {
      expect(screen.getByText(option.title)).toBeInTheDocument();
    }
  });

  it('calls onGuess with the selected option when clicked', async () => {
    const user = userEvent.setup();
    const onGuess = vi.fn();
    render(<MultipleChoiceGuess options={options} onGuess={onGuess} onSkip={vi.fn()} />);

    await user.click(screen.getByText('Under Pressure'));

    expect(onGuess).toHaveBeenCalledWith({
      id: 'dz-2',
      title: 'Under Pressure',
      artist: 'Queen',
      albumArtUrl: null,
    });
  });

  it('calls onSkip when the skip button is clicked', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<MultipleChoiceGuess options={options} onGuess={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('disables all buttons when disabled', () => {
    render(<MultipleChoiceGuess options={options} onGuess={vi.fn()} onSkip={vi.fn()} disabled />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

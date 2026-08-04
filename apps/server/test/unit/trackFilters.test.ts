import { describe, it, expect } from 'vitest';
import {
  isUnwantedVersion,
  mentionsFeature,
  normalizeTitle,
  stripVersionSuffix,
} from '../../src/utils/trackFilters';

describe('isUnwantedVersion', () => {
  it.each([
    'Yellow (Acoustic)',
    'Yellow - Live at Wembley',
    'Yellow (Remix)',
    'Yellow (Instrumental)',
    'Yellow - Karaoke Version',
    'Tribute to Coldplay',
    'Made Famous By Coldplay',
    'Yellow (Sped Up)',
    'Yellow (Slowed + Reverb)',
    'Yellow - Radio Edit',
  ])('flags %s as an unwanted version', (title) => {
    expect(isUnwantedVersion(title)).toBe(true);
  });

  it.each(['Yellow', 'Bohemian Rhapsody', 'Livin’ on a Prayer', "Don't Stop Me Now"])(
    'does not flag a normal title like %s',
    (title) => {
      expect(isUnwantedVersion(title)).toBe(false);
    },
  );
});

describe('mentionsFeature', () => {
  it.each([
    'Ma Meilleure Ennemie ft. Coldplay',
    'Some Song feat. Someone',
    'Track (Featuring Artist)',
  ])('flags %s as mentioning a feature', (title) => {
    expect(mentionsFeature(title)).toBe(true);
  });

  it('does not flag a title with no feature credit', () => {
    expect(mentionsFeature('The Scientist')).toBe(false);
  });
});

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation so near-duplicate titles compare equal', () => {
    expect(normalizeTitle('Bohemian Rhapsody!')).toBe(normalizeTitle('bohemian rhapsody'));
  });
});

describe('stripVersionSuffix', () => {
  it.each([
    ['Eyes Closed (2x Speed)', 'Eyes Closed'],
    ['Eyes Closed (0.5x)', 'Eyes Closed'],
    ['Eyes Closed (Slowed + Reverb)', 'Eyes Closed'],
    ['Eyes Closed (Sped Up)', 'Eyes Closed'],
    ['Pillowtalk (Living Room Session)', 'Pillowtalk'],
    ['Yellow - Live at Wembley', 'Yellow'],
    ['Yellow (Acoustic)', 'Yellow'],
    ['Hotel California - 2013 Remaster', 'Hotel California'],
    ['Song (Album Version)', 'Song'],
    ['Song (Official Music Video)', 'Song'],
    ['Song (Acoustic) (Live)', 'Song'],
  ])('strips version suffix from %s → %s', (title, expected) => {
    expect(stripVersionSuffix(title)).toBe(expected);
  });

  it('keeps real parenthetical titles untouched', () => {
    expect(stripVersionSuffix('Single Ladies (Put a Ring on It)')).toBe(
      'Single Ladies (Put a Ring on It)',
    );
    expect(stripVersionSuffix('Waka Waka (This Time for Africa)')).toBe(
      'Waka Waka (This Time for Africa)',
    );
    expect(stripVersionSuffix('Stay (2001)')).toBe('Stay (2001)');
  });

  it('leaves plain titles unchanged', () => {
    expect(stripVersionSuffix('Eyes Closed')).toBe('Eyes Closed');
  });
});

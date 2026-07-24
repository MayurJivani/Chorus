import { describe, it, expect } from 'vitest';
import { isUnwantedVersion, mentionsFeature, normalizeTitle } from '../../src/utils/trackFilters';

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

import { describe, it, expect } from 'vitest';
import { parseRoomCode } from './QrScanner';

describe('parseRoomCode', () => {
  it('pulls the code out of a full invite URL', () => {
    expect(parseRoomCode('https://chorusify.com/room/ABC123')).toBe('ABC123');
  });

  it('accepts a bare code, since a hand-made QR is a valid invite too', () => {
    expect(parseRoomCode('ABC123')).toBe('ABC123');
  });

  it('upper-cases what it finds, matching how room codes are stored', () => {
    expect(parseRoomCode('https://chorusify.com/room/abc123')).toBe('ABC123');
    expect(parseRoomCode('abc123')).toBe('ABC123');
  });

  it('tolerates surrounding whitespace and a trailing path', () => {
    expect(parseRoomCode('  https://chorusify.com/room/ABC123?utm=x  ')).toBe('ABC123');
  });

  it('works against a localhost origin, so a dev QR scans the same as production', () => {
    expect(parseRoomCode('http://localhost:5174/room/QWER99')).toBe('QWER99');
  });

  /* The rejections matter as much as the matches: an unrecognised QR has to leave the scanner
     running rather than navigate somewhere broken. */
  it('ignores a QR that is not an invite', () => {
    expect(parseRoomCode('WIFI:S:MyNetwork;T:WPA;P:hunter2;;')).toBeNull();
    expect(parseRoomCode('https://example.com/not-a-room')).toBeNull();
    expect(parseRoomCode('')).toBeNull();
    expect(parseRoomCode('   ')).toBeNull();
  });

  it('rejects codes outside the plausible length range', () => {
    expect(parseRoomCode('ABC')).toBeNull();
    expect(parseRoomCode('A'.repeat(13))).toBeNull();
  });

  it('rejects a bare string with punctuation, which is never a room code', () => {
    expect(parseRoomCode('ABC-123')).toBeNull();
  });
});

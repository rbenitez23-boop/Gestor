import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256 } from '../../src/services/crypto';

describe('sha256 (Web Crypto)', () => {
  it('coincide con el hash SHA-256 estándar de Node para el mismo texto', async () => {
    const expected = createHash('sha256').update('1234', 'utf-8').digest('hex');
    const actual = await sha256('1234');
    expect(actual).toBe(expected);
  });

  it('produce hashes distintos para PINs distintos', async () => {
    expect(await sha256('1234')).not.toBe(await sha256('4321'));
  });
});

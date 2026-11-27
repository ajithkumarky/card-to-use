import { describe, expect, it } from 'vitest';
import { catalog, libraryCards, programs } from '../src/core/catalog';
import { matchCardLabel } from '../src/core/recommend';
import { CATEGORY_IDS, PROGRAM_IDS } from '../src/core/types';

const card = (id: string) => libraryCards.find((c) => c.id === id)!;

describe('catalog', () => {
  it('has a dated catalog and a program entry for every program id', () => {
    expect(catalog.asOf).toMatch(/^\d{4}-\d{2}$/);
    expect(Object.keys(programs).sort()).toEqual([...PROGRAM_IDS].sort());
    for (const p of catalog.programs) {
      expect(p.bestCents).toBeGreaterThan(0);
      expect(p.cashCents).toBeGreaterThan(0);
      expect(p.cashCents).toBeLessThanOrEqual(p.bestCents);
    }
  });

  it('gives every card a unique id, a known program and sane rates', () => {
    const ids = new Set<string>();
    for (const c of libraryCards) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(programs[c.program], c.id).toBeDefined();
      expect(c.annualFee, c.id).toBeGreaterThanOrEqual(0);
      expect(c.base, c.id).toBeGreaterThan(0);
      expect(c.apr, c.id).not.toBe('');
      expect(c.color, c.id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const [cat, r] of Object.entries(c.rates)) {
        expect(CATEGORY_IDS, `${c.id} ${cat}`).toContain(cat);
        expect(r!.rate, `${c.id} ${cat}`).toBeGreaterThan(0);
        if (r!.cap !== undefined) expect(r!.cap, `${c.id} ${cat}`).toBeGreaterThan(0);
      }
      expect(c.aliases.length, c.id).toBeGreaterThan(0);
      for (const a of c.aliases) expect(a, c.id).toBe(a.toLowerCase());
    }
  });

  it('covers the major issuers', () => {
    const issuers = new Set(libraryCards.map((c) => c.issuer));
    for (const i of ['Chase', 'American Express', 'Citi', 'Capital One', 'U.S. Bank', 'Wells Fargo', 'Bank of America', 'Discover', 'Barclays']) {
      expect(issuers, i).toContain(i);
    }
  });
});

describe('card labels', () => {
  it('prefers the longest matching name when cards share a word', () => {
    const held = [card('amex-gold'), card('amex-delta-gold'), card('amex-platinum'), card('amex-delta-platinum')];
    expect(matchCardLabel('Delta SkyMiles Gold Card', held)?.id).toBe('amex-delta-gold');
    expect(matchCardLabel('Amex Gold', held)?.id).toBe('amex-gold');
    expect(matchCardLabel('Platinum Card', held)?.id).toBe('amex-platinum');
    expect(matchCardLabel('Delta Platinum -1001', held)?.id).toBe('amex-delta-platinum');
  });

  it('tells Venture X from Venture', () => {
    const held = [card('capital-one-venture'), card('capital-one-venture-x')];
    expect(matchCardLabel('VENTURE X ...4321', held)?.id).toBe('capital-one-venture-x');
    expect(matchCardLabel('Venture Rewards', held)?.id).toBe('capital-one-venture');
  });
});

import type { Card, CategoryId } from './types';

/** What the cardholder picked for each tier of a pick-your-category card, by card id. */
export type Choices = Record<string, CategoryId[][]>;

/**
 * The categories each tier earns on now: the cardholder's picks, else for an automatic card
 * (Citi Custom Cash) the eligible categories with the most spend, else the card's defaults.
 */
export function pickedCategories(card: Card, picks: CategoryId[][] | undefined, spend?: Partial<Record<CategoryId, number>>): CategoryId[][] {
  if (!card.choice) return [];
  const taken = new Set<CategoryId>();
  return card.choice.tiers.map((tier, i) => {
    const mine = [...new Set(picks?.[i] ?? [])].filter((c) => tier.options.includes(c) && !taken.has(c)).slice(0, tier.count);
    let cats = mine;
    if (!cats.length && card.choice!.auto && spend) {
      const top = tier.options.filter((c) => !taken.has(c) && (spend[c] ?? 0) > 0).sort((a, b) => (spend[b] ?? 0) - (spend[a] ?? 0));
      cats = top.slice(0, tier.count);
    }
    if (!cats.length) cats = tier.defaults.filter((c) => !taken.has(c)).slice(0, tier.count);
    cats.forEach((c) => taken.add(c));
    return cats;
  });
}

/** The card with its chosen categories written into its rates, so the rest of the app treats them like any category rate. */
export function applyChoices(card: Card, picks: CategoryId[][] | undefined, spend?: Partial<Record<CategoryId, number>>): Card {
  if (!card.choice) return card;
  const chosen = pickedCategories(card, picks, spend);
  const rates = { ...card.rates };
  card.choice.tiers.forEach((tier, i) => {
    for (const c of chosen[i]) {
      const had = rates[c];
      if (!had || had.rate < tier.rate) rates[c] = tier.cap ? { rate: tier.rate, cap: tier.cap } : { rate: tier.rate };
    }
  });
  return { ...card, rates, picked: chosen.flat(), pickedTiers: chosen };
}

import raw from '../data/cards.json';
import type { Card, Catalog, ProgramId, Program } from './types';

export const catalog = raw as Catalog;
export const programs = Object.fromEntries(catalog.programs.map((p) => [p.id, p])) as Record<ProgramId, Program>;
export const libraryCards: Card[] = catalog.cards;

/**
 * Starter decks, so a new visitor (a judge, say) has something real to study at once: three short
 * public documents from US government sources, turned into cards by Recall's own pipeline, with
 * Gemini through Firebase AI Logic writing the cards and a second, larger model fact-checking them
 * (scripts/starter-decks.cjs, which writes data/starter-decks.json). Nothing here is written by
 * hand, and there is no made-up study history: everything a visitor sees afterwards is their own.
 */
import type { DraftCard } from './prompts';
import type { Engine } from './types';
import decks from '../data/starter-decks.json';

export interface StarterDeck {
  title: string;
  publisher: string;
  /** Where the document can be read. */
  url: string;
  /** Which engine wrote the cards, and which fact-checked them. */
  madeBy: Engine;
  checkedBy: Engine;
  /** When the cards were made (YYYY-MM-DD). */
  madeAt: string;
  cards: DraftCard[];
}

export const STARTER_DECKS = decks as StarterDeck[];

/** A stable id for a starter deck, so loading it twice overwrites rather than duplicates. */
export const starterDeckId = (deck: StarterDeck): string => `starter-${deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

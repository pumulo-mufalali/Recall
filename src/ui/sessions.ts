/** How a planned session is named, described and opened: by Plan, Today and the reminders. */
import type { Session } from '../core/plan';
import type { Deck } from '../core/types';

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function sessionText(s: Session, decks: Deck[]): { title: string; body: string; hash: string } {
  const deck = s.deckId ? decks.find((d) => d.id === s.deckId) : undefined;
  const what = deck ? deck.title : 'Your due cards';
  return {
    title: `Recall: ${what}`,
    body: `${s.minutes}-minute study session at ${time(new Date(s.at))}`,
    hash: deck ? `#/study/${deck.id}` : '#/study',
  };
}

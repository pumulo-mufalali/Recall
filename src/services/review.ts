/**
 * New cards on their way to the learner: made by a model, then fact-checked against their
 * material before they can be saved (see core/verify.ts). Used by Add, and by the queue runner
 * for material that waited for a connection.
 */
import type { DraftCard } from '../core/prompts';
import type { Route } from '../core/route';
import type { Engine } from '../core/types';
import type { CardCheck } from '../core/verify';
import { verifyCards, type Material } from './engine';
import type { Settings } from './firebase';

export interface Draft extends DraftCard {
  check: CardCheck;
  resolved: boolean;
}

export interface Review {
  title: string;
  source: 'text' | 'image' | 'pdf';
  material: Material;
  drafts: Draft[];
  madeBy: Engine;
  madeRoute: Route;
  checkedBy: Engine;
  checkRoute: Route;
}

/** Fact-checks freshly made cards, ready for the learner to review. */
export async function reviewOf(title: string, material: Material, drafts: DraftCard[], madeBy: Engine, madeRoute: Route, settings: Settings): Promise<Review> {
  const checked = await verifyCards(drafts, material, settings);
  const source = material.kind === 'text' ? 'text' : material.file.type === 'application/pdf' ? 'pdf' : 'image';
  return {
    title,
    source,
    material,
    drafts: drafts.map((d, i) => ({ ...d, check: checked.value[i], resolved: checked.value[i].status !== 'flagged' })),
    madeBy,
    madeRoute,
    checkedBy: checked.engine,
    checkRoute: checked.route,
  };
}

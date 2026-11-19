/**
 * A ready-made deck, so a first-time visitor (or a judge) can try studying straight away,
 * before adding material of their own. Saved like any other deck; no AI is used to make it.
 */
import type { DraftCard } from '../core/prompts';

export const SAMPLE_TITLE = 'Sample: How vaccines work';

export const SAMPLE_CARDS: DraftCard[] = [
  {
    prompt: 'What does a vaccine train the immune system to do?',
    answer: 'To recognise a specific pathogen, using a harmless version or piece of it, so the body can fight the real thing quickly if it is ever exposed.',
    keyPoints: ['recognise a specific pathogen', 'harmless version or part of it', 'respond quickly on real exposure'],
  },
  {
    prompt: 'What is an antigen?',
    answer: 'A molecule, often a protein on the surface of a pathogen, that the immune system recognises and responds to.',
    keyPoints: ['molecule the immune system recognises', 'often a surface protein of a pathogen'],
  },
  {
    prompt: 'Why is a second encounter with a pathogen usually milder than the first?',
    answer: 'Memory B and T cells made during the first response remain, so the body produces antibodies faster and in larger amounts the second time.',
    keyPoints: ['memory cells remain', 'faster response', 'more antibodies'],
  },
  {
    prompt: 'How does an mRNA vaccine produce immunity?',
    answer: 'It delivers instructions that cells use to make a pathogen protein (such as a spike protein) for a short time; the immune system learns to recognise that protein. The mRNA breaks down and does not enter the cell nucleus.',
    keyPoints: ['cells make a pathogen protein from the instructions', 'immune system learns to recognise it', 'mRNA breaks down and does not alter DNA'],
  },
  {
    prompt: 'What is herd immunity?',
    answer: 'When enough of a population is immune that a disease cannot spread easily, which protects people who cannot be vaccinated.',
    keyPoints: ['enough of the population immune', 'disease cannot spread easily', 'protects those who cannot be vaccinated'],
  },
  {
    prompt: 'Why are booster doses sometimes needed?',
    answer: 'Immunity from some vaccines fades over time, and some pathogens change; a booster restores protection and can update it to newer variants.',
    keyPoints: ['immunity fades over time', 'pathogens can change', 'booster restores or updates protection'],
  },
];

/**
 * How an account is named on screen. A guest (Firebase anonymous sign-in, from "Try it without
 * signing in") has no Google name, email or photo.
 */
import type { User } from 'firebase/auth';

export const accountName = (user: User): string => (user.isAnonymous ? 'Guest' : user.displayName ?? user.email ?? 'Signed in');
export const accountInitial = (user: User): string => accountName(user)[0].toUpperCase();

// Stand-in for firebase/auth: a fake signed-in student. ?signedout in the URL starts signed out;
// signOut() signs out, and window.__signIn() signs back in (for tests).
const user = { uid: 'preview', displayName: 'Sam Student', email: 'sam@example.com', photoURL: null };
const signedOut = location.search.includes('signedout');
let listener: ((u: unknown) => void) | null = null;

export function onAuthStateChanged(_auth: unknown, on: (u: unknown) => void) {
  listener = on;
  setTimeout(() => on(signedOut ? null : user), 0);
  return () => {};
}
export async function signOut() {
  listener?.(null);
}
(window as unknown as { __signIn: () => void }).__signIn = () => listener?.(user);
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  throw new Error('Preview: sign-in is disabled');
}
export async function reauthenticateWithPopup() {}
export async function deleteUser() {}
export async function getRedirectResult() {
  return null;
}
export async function signInWithRedirect() {}
export function getAuth() {
  return {};
}

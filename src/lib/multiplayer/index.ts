/**
 * Multiplayer intentionally disabled for Note App MVP.
 * Knowledge vaults are single-user, local-first.
 */

export const multiplayerEnabled = false;

export function createMultiplayerSession(): never {
  throw new Error("Multiplayer is out of scope for Note App.");
}


let nextIdCounter = 0;

/**
 * Generates a reasonably unique ID string with a given prefix.
 * Not cryptographically secure, but sufficient for in-game entity tracking.
 * @param {string} [prefix='id'] - The prefix for the generated ID.
 * @returns {string} A unique ID string.
 */
export function generateUniqueId(prefix = 'id') {
  nextIdCounter++;
  // Using a combination of prefix, timestamp (in base36 for brevity), a session counter, and a random string.
  return `${prefix}-${Date.now().toString(36)}-${nextIdCounter}-${Math.random().toString(36).substring(2, 9)}`;
}
console.log('[idGenerator.js] Module loaded successfully.');

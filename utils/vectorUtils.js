/**
 * Calculates the normalized average movement vector from a history of vectors.
 * If the history is too short, returns a fallback vector.
 * @param {Array<Position>} history Array of recent movement vectors.
 * @param {Position} fallbackVector Vector to return if history is empty or too short.
 * @param {number} minHistoryLengthForSmoothing Minimum number of vectors required in history to calculate an average.
 * @returns {Position} A normalized average movement vector or the fallback vector.
 */
export const getAverageMovementVector = (
    history, 
    fallbackVector = { x: 0, y: 1 },
    minHistoryLengthForSmoothing = 1
) => {
  if (history.length === 0 || history.length < minHistoryLengthForSmoothing) {
    return fallbackVector;
  }

  let sumX = 0;
  let sumY = 0;
  for (const vec of history) {
    sumX += vec.x;
    sumY += vec.y;
  }

  const avgX = sumX / history.length;
  const avgY = sumY / history.length;

  const magnitude = Math.sqrt(avgX * avgX + avgY * avgY);
  if (magnitude === 0) {
    return fallbackVector; 
  }

  return { x: avgX / magnitude, y: avgY / magnitude };
};

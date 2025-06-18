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

/**
 * Checks if a point (x, y) is inside the viewport rectangle.
 * @param {number} x - X coordinate of the point.
 * @param {number} y - Y coordinate of the point.
 * @param {{x: number, y: number, width: number, height: number}} viewport - The viewport rectangle.
 * @returns {boolean}
 */
export function isPositionInViewport(x, y, viewport) {
    return (
        x >= viewport.x &&
        x <= viewport.x + viewport.width &&
        y >= viewport.y &&
        y <= viewport.y + viewport.height
    );
}

export function getCurrentViewport(camera, canvas) {
    return {
        x: camera.x,
        y: camera.y,
        width: canvas.width,
        height: canvas.height
    };
}

/** Face descriptors are 128-number vectors computed in the browser. Smaller distance = more similar faces. */
export const faceDistance = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
export const faceMatches = (enrolled: number[], live: number[], threshold: number) =>
  enrolled.length === 128 && live.length === 128 && faceDistance(enrolled, live) <= threshold;

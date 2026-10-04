/**
 * Tracks the heading path while walking a document. A stack of (level, title) is needed
 * because levels can be skipped and documents need not start at h1: a new heading replaces
 * every open heading at its level or deeper, whatever positions they sit at.
 */
export function createHeadingTracker(base: string[] = []) {
 const stack: { level: number; title: string }[] = [];
 return {
  open(level: number, title: string): string[] {
   while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
   stack.push({ level, title });
   return this.path();
  },
  path: (): string[] => [...base, ...stack.map((h) => h.title)],
 };
}

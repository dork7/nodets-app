// Registry to hold all dynamic methods
const registry = new Map();

/**
 * Register a new method
 * @param {string} name
 * @param {Function} handler
 */
export function registerMethod(name: string, handler: any) {
 registry.set(name, handler);
}

/**
 * Get a method handler
 */
export function getMethod(name: string) {
 return registry.get(name);
}

/**
 * Return list of all registered methods
 */
export function listMethods() {
 return Array.from(registry.keys());
}

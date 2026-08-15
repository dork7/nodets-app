// Registry to hold all dynamically loaded model instances (OpenAI-compatible clients)
const registry = new Map<string, unknown>();

/**
 * Register a new model instance
 */
export function registerModel(name: string, handler: unknown) {
 registry.set(name, handler);
}

/**
 * Get a model instance by name
 */
export function getModel(name: string) {
 return registry.get(name);
}

/**
 * Return list of all registered model instances
 */
export function listModels() {
 return Array.from(registry.keys());
}

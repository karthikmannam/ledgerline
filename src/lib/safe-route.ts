export function safeRouteTemplate(req: unknown): string | undefined {
  try {
    const route = (req as { route?: { path?: unknown } } | null | undefined)?.route;
    const path = route?.path;
    if (typeof path !== 'string' || path.length === 0 || !path.startsWith('/')) {
      return undefined;
    }
    return path;
  } catch {
    return undefined;
  }
}

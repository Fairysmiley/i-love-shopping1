import { api } from './client';
import type { Category } from './types';

let cachedTree: Category[] | null = null;
let inflight: Promise<Category[] | null> | null = null;

export function getCachedCategoryTree(): Category[] {
  return cachedTree ?? [];
}

function normalize(nodes: unknown): Category[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((raw) => {
    const n = raw as Category;
    return {
      id: n.id,
      name: n.name,
      slug: n.slug,
      description: n.description ?? null,
      children: normalize(n.children),
    };
  });
}

/** Depth-first list for sidebar filters (parent then children). */
export function flattenCategoryTree(nodes: Category[]): Category[] {
  return nodes.flatMap((c) => [c, ...flattenCategoryTree(c.children ?? [])]);
}

/**
 * Cached category tree — survives CatalogPage remounts (e.g. product detail → back).
 * De-duplicates concurrent requests and retries once on transient failures.
 */
export async function loadCategoryTree(force = false): Promise<Category[] | null> {
  if (!force && cachedTree) return cachedTree;
  if (!force && inflight) return inflight;

  const run = async (attempt: number): Promise<Category[] | null> => {
    try {
      const data = await api.get<Category[]>('/categories/tree');
      cachedTree = normalize(data);
      return cachedTree;
    } catch {
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 400));
        return run(attempt + 1);
      }
      return cachedTree;
    }
  };

  inflight = run(0).finally(() => {
    inflight = null;
  });
  return inflight;
}

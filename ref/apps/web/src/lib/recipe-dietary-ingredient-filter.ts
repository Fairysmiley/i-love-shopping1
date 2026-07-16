/**
 * Seed data can assign dietaryTags independently of ingredient text.
 * When users filter by vegan / vegetarian / dairy-free / gluten-free, we also
 * scan title, summary, ingredients, and preparation so obvious mismatches
 * (e.g. "vegan" tag + chicken) are excluded.
 */

export function expandDietaryInput(input: string): string[] {
  const t = input.trim().toLowerCase();
  if (!t) return [];
  const map: Record<string, string[]> = {
    gluten: ["gluten-free", "gluten_free"],
    "gluten-free": ["gluten-free", "gluten_free"],
    gluten_free: ["gluten-free", "gluten_free"],
    dairy: ["dairy-free", "dairy_free"],
    diary: ["dairy-free", "dairy_free"],
    "dairy-free": ["dairy-free", "dairy_free"],
    dairy_free: ["dairy-free", "dairy_free"],
    vegetarian: ["vegetarian"],
    vegan: ["vegan"],
    "nut allergy": ["nut_allergy", "nut-free"],
    nut_allergy: ["nut_allergy", "nut-free"],
    "high protein": ["high_protein", "high-protein"],
    high_protein: ["high_protein", "high-protein"],
    "low carb": ["low_carb", "low-carb"],
    low_carb: ["low_carb", "low-carb"],
    keto: ["keto"],
    paleo: ["paleo"],
    halal: ["halal"],
    kosher: ["kosher"],
  };
  const expanded = map[t] ?? [t, t.replace(/-/g, "_"), t.replace(/_/g, "-")];
  return [...new Set(expanded)];
}

function expandedDietaryTagSet(dietaryList: string[]): Set<string> {
  const tags = new Set<string>();
  for (const d of dietaryList) {
    for (const x of expandDietaryInput(d)) {
      tags.add(x.toLowerCase());
    }
  }
  return tags;
}

export function dietaryNeedsIngredientScan(dietaryList: string[]): boolean {
  const tags = expandedDietaryTagSet(dietaryList);
  return (
    tags.has("vegan") ||
    tags.has("vegetarian") ||
    tags.has("gluten-free") ||
    tags.has("gluten_free") ||
    tags.has("dairy-free") ||
    tags.has("dairy_free")
  );
}

/**
 * Prisma matches every selected diet with AND on `dietaryTags`. Vegan food is
 * dairy-free and meat-free, but rows are often tagged only `vegan`, not also
 * `dairy-free` / `vegetarian`. When `vegan` is among the filters, drop other
 * selections that are logically implied so the tag query does not shrink the
 * pool incorrectly. Ingredient-level checks still use the full `dietaryList`.
 */
export function dietaryListForPrismaTagQuery(dietaryList: string[]): string[] {
  const union = expandedDietaryTagSet(dietaryList);
  if (!union.has("vegan")) return dietaryList;
  const impliedByVeganForDbTagsOnly = new Set(["vegetarian", "dairy-free", "dairy_free"]);
  return dietaryList.filter((d) => {
    const ex = expandDietaryInput(d).map((x) => x.toLowerCase());
    if (ex.length === 0) return true;
    const onlyImplied = ex.every((x) => impliedByVeganForDbTagsOnly.has(x));
    return !onlyImplied;
  });
}

/** Strip plant-based milks so a naive "milk" pattern does not false-positive. */
function stripPlantMilks(s: string): string {
  return s.replace(/\b(coconut|almond|oat|soy|cashew|rice|hemp|pea) milk\b/gi, " ");
}

const MEAT_FISH_SHELLFISH =
  /\b(chicken|beef|pork|lamb|veal|mutton|turkey|duck|goose|quail|bacon|ham|prosciutto|salami|sausage|chorizo|pepperoni|mortadella|pastrami|brisket|ribeye|sirloin|steak|ribs|ground beef|minced beef|meatball|salmon|tuna|cod|halibut|trout|sardine|anchovy|herring|mackerel|tilapia|sea bass|bass|fish|caviar|\broe\b|shrimp|prawn|lobster|crab|clam|oyster|mussel|scallop|squid|octopus|calamari|shellfish|foie gras|sweetbreads|liver)\b/i;

const EGGS = /\b(eggs?|egg whites?|egg yolks?|mayonnaise|mayo)\b/i;

const DAIRY =
  /\b(milk|cream cheese|\bcream\b|butter|ghee|cheese|yogurt|yoghurt|whey|casein|kefir|ricotta|mozzarella|cheddar|parmesan|pecorino|feta|paneer|fromage|dairy|buttermilk|sour cream|mascarpone|creme fraiche|crème fraîche|half and half|half-and-half|creamer)\b/i;

const VEGAN_EXTRAS = /\b(honey|gelatin|lard|tallow|suet)\b/i;

const GLUTEN =
  /\b(wheat|barley|rye|bulgur|couscous|semolina|farro|spelt|durum|seitan|panko|breadcrumbs?|orzo|udon|soy sauce|malt extract|barley malt|gluten)\b/i;

export function collectRecipeTextForDietaryFilter(recipe: {
  title: string;
  summary?: string | null;
  ingredients?: unknown;
  preparation?: unknown;
}): string {
  const parts: string[] = [recipe.title];
  if (recipe.summary) parts.push(String(recipe.summary));
  const ings = recipe.ingredients;
  if (Array.isArray(ings)) {
    for (const i of ings) {
      if (i && typeof i === "object" && "name" in i) {
        parts.push(String((i as { name?: string }).name ?? ""));
      }
    }
  }
  const prep = recipe.preparation;
  if (Array.isArray(prep)) {
    for (const p of prep) {
      if (p && typeof p === "object") {
        const o = p as { step?: string; description?: string; ingredients?: unknown };
        if (o.step) parts.push(o.step);
        if (o.description) parts.push(o.description);
        if (Array.isArray(o.ingredients)) parts.push(o.ingredients.join(" "));
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Returns true if recipe text does not obviously violate the given dietary filters.
 * Intended as a supplement to DB dietaryTags matching, not a legal allergen guarantee.
 */
export function recipeTextRespectsDietaryFilters(text: string, dietaryList: string[]): boolean {
  const tags = expandedDietaryTagSet(dietaryList);
  const t = text.toLowerCase();
  const dairyText = stripPlantMilks(t);

  if (tags.has("vegan")) {
    if (MEAT_FISH_SHELLFISH.test(t)) return false;
    if (EGGS.test(t)) return false;
    if (DAIRY.test(dairyText)) return false;
    if (VEGAN_EXTRAS.test(t)) return false;
  } else if (tags.has("vegetarian")) {
    if (MEAT_FISH_SHELLFISH.test(t)) return false;
  }

  if ((tags.has("dairy-free") || tags.has("dairy_free")) && !tags.has("vegan")) {
    if (DAIRY.test(dairyText)) return false;
  }

  if (tags.has("gluten-free") || tags.has("gluten_free")) {
    if (GLUTEN.test(t)) return false;
  }

  return true;
}

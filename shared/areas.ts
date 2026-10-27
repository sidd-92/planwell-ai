// The only places PlanWell.AI plans events. Keeps Google Places usage small and results relevant.
export const PUNE_AREAS = ['Koregaon Park', 'Kothrud', 'Baner', 'Viman Nagar'] as const;
export type PuneArea = (typeof PUNE_AREAS)[number];

/** Directory categories: the Places text-search term for each, and the planner categories that map to it. */
export const VENDOR_CATEGORIES: { key: string; search: string; match: RegExp }[] = [
  { key: 'Venue', search: 'event venue banquet hall', match: /venue|hall|location/i },
  { key: 'Catering', search: 'wedding caterer', match: /cater|food|bar|beverage/i },
  { key: 'Photography', search: 'wedding photographer', match: /photo|film|video/i },
  { key: 'Music', search: 'DJ for events', match: /music|dj|band|sound/i },
  { key: 'Florist', search: 'florist event decorator', match: /flor|decor|flower/i },
  { key: 'Makeup', search: 'bridal makeup artist', match: /hair|makeup|beauty/i },
  { key: 'Rentals', search: 'event rental tables chairs tent', match: /rental|furniture|lounge|linen|tent/i },
  { key: 'Cake', search: 'custom cake bakery', match: /cake|bak|dessert/i },
];

export function areaFromLocation(location: string): PuneArea | undefined {
  return PUNE_AREAS.find((a) => location.toLowerCase().includes(a.toLowerCase()));
}

/** The key a planner category is filed under: a built-in type when one matches, otherwise its own cleaned name (looked up on demand). */
export function directoryKey(plannerCategory: string): string | undefined {
  const known = directoryCategory(plannerCategory);
  if (known) return known;
  const cleaned = plannerCategory.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned || undefined;
}

/** What to search for on Google Places for a directory key. */
export function searchTermFor(key: string): string {
  return VENDOR_CATEGORIES.find((c) => c.key === key)?.search ?? key;
}

export function directoryCategory(plannerCategory: string): string | undefined {
  return VENDOR_CATEGORIES.find((c) => c.match.test(plannerCategory))?.key;
}

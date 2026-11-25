// Colors of an event category. Full class names only: Tailwind finds them by text.
// solid = white text on the category color, soft = the color on its own light tint.
const COLORS = {
  music: { solid: 'bg-cat-music', soft: 'bg-cat-music/12 text-cat-music' },
  education: { solid: 'bg-cat-education', soft: 'bg-cat-education/12 text-cat-education' },
  sports: { solid: 'bg-cat-sports', soft: 'bg-cat-sports/12 text-cat-sports' },
  tech: { solid: 'bg-cat-tech', soft: 'bg-cat-tech/12 text-cat-tech' },
  arts: { solid: 'bg-cat-arts', soft: 'bg-cat-arts/12 text-cat-arts' },
  business: { solid: 'bg-cat-business', soft: 'bg-cat-business/12 text-cat-business' },
  other: { solid: 'bg-brand-700', soft: 'bg-brand-100 text-brand-700' },
}

// Organizers can type any category, so unknown and empty ones share one color.
export function categoryKey(category) {
  return String(category ?? '').trim().toLowerCase()
}

export function categoryColors(category) {
  const key = categoryKey(category)
  return Object.hasOwn(COLORS, key) ? COLORS[key] : COLORS.other
}

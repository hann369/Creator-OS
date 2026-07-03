// Dynamic web-font loading — lets a user "install" a font for a moodboard by
// picking it; we inject the Google Fonts stylesheet on demand. Custom family
// names still work (they fall back to whatever is installed on the system).

// Curated display / brand fonts (bold, editorial, condensed — the brand-deck vibe).
export const FONT_OPTIONS = [
  'Anton',
  'Archivo',
  'Archivo Black',
  'Bebas Neue',
  'Oswald',
  'Barlow Condensed',
  'Space Grotesk',
  'Syne',
  'Sora',
  'Manrope',
  'Inter',
  'DM Sans',
  'Figtree',
  'Unbounded',
  'Playfair Display'
];

const loaded = new Set<string>();

export function loadFont(family?: string): void {
  if (!family) return;
  const key = family.trim();
  if (!key || loaded.has(key) || !FONT_OPTIONS.includes(key)) return; // only auto-load known Google fonts
  loaded.add(key);
  const id = 'gf-' + key.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${key.replace(/\s+/g, '+')}:wght@400;500;700;900&display=swap`;
  document.head.appendChild(link);
}

export function fontStack(family?: string): string {
  return family ? `'${family}', system-ui, sans-serif` : 'inherit';
}

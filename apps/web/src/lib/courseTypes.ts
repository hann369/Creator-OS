// Shared domain types for the Course Maker (Phase 1). Kept in lib so hooks and
// views agree on one shape. Media blocks reference a Storage PATH (never bytes) —
// see media.ts for upload/signed-URL handling.

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export type CourseStatus = typeof COURSE_STATUSES[number];

export interface CourseTheme {
  accent?: string;      // hex accent for the public page
  font?: string;        // font family key (see lib/fonts.ts)
}

export interface Course {
  id: string;
  workspaceId: string;
  slug: string | null;          // set on publish
  title: string;
  subtitle: string;
  coverUrl: string | null;
  priceCents: number;           // 0 = free
  currency: string;             // 'eur' | 'usd' | …
  status: CourseStatus;
  theme: CourseTheme;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Page {
  id: string;
  chapterId: string;
  courseId: string;
  title: string;
  position: number;
  isPreview: boolean;           // publicly visible without purchase (Phase 2)
  createdAt: Date;
  updatedAt: Date;
}

export const BLOCK_TYPES = ['heading', 'text', 'callout', 'divider', 'image', 'video', 'pdf', 'embed'] as const;
export type BlockType = typeof BLOCK_TYPES[number];

/** Media block types store a Storage path; the rest store inline text/url. */
export const MEDIA_BLOCK_TYPES: BlockType[] = ['image', 'video', 'pdf'];

/**
 * Loose-but-documented block payload. `text` for heading/text/callout;
 * media blocks (image/video/pdf) carry `path` (+ mime/size/caption); `embed`
 * carries a `url`. Stored verbatim as jsonb.
 */
export interface BlockContent {
  text?: string;
  // media (image/video/pdf) → uploaded to Storage, referenced by path
  path?: string;
  mime?: string;
  sizeBytes?: number;
  caption?: string;
  // embed
  url?: string;
}

export interface Block {
  id: string;
  pageId: string;
  courseId: string;
  type: BlockType;
  content: BlockContent;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export function isMediaBlock(type: BlockType): boolean {
  return MEDIA_BLOCK_TYPES.includes(type);
}

// Combining diacritical marks (U+0300–U+036F), stripped after NFKD normalize.
const DIACRITICS = /[̀-ͯ]/g;

/** URL-safe slug from a course title. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')       // é → e, ü → u
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'course';
}

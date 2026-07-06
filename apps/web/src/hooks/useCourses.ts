import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from '../store/collection.js';
import { type Course, type CourseStatus, type CourseTheme, slugify } from '../lib/courseTypes.js';

// Top-level course list — project-scoped, backed by the shared entity collection
// (same offline-first pattern as useGoals/useAssets). This holds only the LIGHT
// course metadata (title, price, status, cover); a course's chapters/pages/blocks
// live in useCourseContent and are loaded lazily per course, so this store stays
// tiny regardless of how large the courses themselves get.

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function rowToCourse(r: any): Course {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    slug: r.slug ?? null,
    title: r.title ?? 'Untitled course',
    subtitle: r.subtitle ?? '',
    coverUrl: r.cover_url ?? r.coverUrl ?? null,
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : (r.priceCents ?? 0),
    currency: r.currency ?? 'eur',
    status: (r.status ?? 'draft') as CourseStatus,
    theme: (r.theme ?? {}) as CourseTheme,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function courseToRow(c: Course) {
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    cover_url: c.coverUrl,
    price_cents: c.priceCents,
    currency: c.currency,
    status: c.status,
    theme: c.theme,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

const courses = createCollection<Course>({
  table: 'courses', lsKey: 'pronoia_courses', idOf: (c) => c.id,
  fromRow: rowToCourse, toRow: courseToRow, stampUpdatedAt: true,
});

export function useCourses() {
  const items = courses.useItems();

  const addCourse = useCallback((title = 'Untitled course'): Course => {
    const now = new Date();
    const c: Course = {
      id: uid('course'), workspaceId: getActiveWorkspaceId(), slug: null,
      title: title.trim() || 'Untitled course', subtitle: '', coverUrl: null,
      priceCents: 0, currency: 'eur', status: 'draft', theme: {}, createdAt: now, updatedAt: now,
    };
    courses.add(c);
    return c;
  }, []);

  const updateCourse = useCallback((id: string, patch: Partial<Course>) => courses.update(id, patch), []);
  const deleteCourse = useCallback((id: string) => courses.remove(id), []);

  // Publish assigns a slug (from the title) if none exists yet, and flips status.
  const publishCourse = useCallback((c: Course) => {
    const slug = c.slug ?? `${slugify(c.title)}-${c.id.slice(-6)}`;
    courses.update(c.id, { status: 'published', slug });
    return slug;
  }, []);
  const unpublishCourse = useCallback((id: string) => courses.update(id, { status: 'draft' }), []);

  return { courses: items, addCourse, updateCourse, deleteCourse, publishCourse, unpublishCourse };
}

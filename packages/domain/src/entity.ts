// ─────────────────────────────────────────────────────────────────────────────
// THE ENTITY SPINE
//
// Pronoia's core hypothesis: a Pipeline Card, a Document, a Moodboard, a Goal and
// a Graph Node are not separate data models — they are typed *faces* of one
// semantic system, connected by a graph of Relationships.
//
// Design decision (deliberate): entities stay STRONGLY TYPED. `Entity` is only the
// shared identity spine; each concrete type extends it with real fields. We do NOT
// collapse everything into an untyped `metadata` bag — that would throw away the
// type safety that makes the domain trustworthy. Relationships are what unify the
// types; a lowest-common-denominator schema is not.
//
// Relationships are FIRST-CLASS records (a graph), not inline id arrays — this
// generalises the existing WorldEdge and keeps direction, type and weight explicit.
// ─────────────────────────────────────────────────────────────────────────────

export type EntityType =
  | 'project'
  | 'goal'
  | 'pipeline_card'
  | 'document'
  | 'moodboard'
  | 'asset'
  | 'identity'
  | 'concept'
  | 'research'
  | 'video';

/** The shared identity spine every entity carries. */
export interface Entity {
  id: string;
  workspaceId: string;
  type: EntityType;
  title: string;
  /** Escape hatch for view-specific data (e.g. graph x/y). Never the primary store of typed fields. */
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Relationships (the unifying graph) ──────────────────────────────────────

export type RelationshipType =
  | 'has_view'        // a card ⇄ its graph-node projection (replaces the card:{id} mirror hack)
  | 'references'
  | 'supports'
  | 'contradicts'
  | 'depends_on'
  | 'derived_from'
  | 'belongs_to'
  | 'uses'
  | 'styled_by'       // pipeline card → moodboard / identity
  | 'produces'        // pipeline card → published video/asset
  | 'attached_to'
  | 'evidences'
  | 'blocks'
  | 'goal_supports';

export interface Relationship {
  id: string;
  workspaceId: string;
  sourceId: string;   // Entity id
  targetId: string;   // Entity id
  type: RelationshipType;
  weight?: number;    // 0..1
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Shared value objects ────────────────────────────────────────────────────

export interface Color {
  hex: string;
  name?: string;
  role?: string; // e.g. 'accent', 'background'
}

export interface Typography {
  heading?: string;
  body?: string;
  accent?: string;
}

// ─── Moodboard (Identity feeder + knowledge object) ──────────────────────────

export type Ratio = '1:1' | '9:16' | '16:9';
export type BoardType =
  | 'video_brand_deck' | 'website_branding' | 'short_form' | 'writing' | 'custom';
export interface BoardFonts { title: string; subheading: string; caption: string; }

export type MoodItemKind = 'image' | 'color' | 'text';

export interface MoodboardItem {
  id: string;
  kind: MoodItemKind;         // 'image' | 'color' | 'text'   (Diskriminator heißt kanonisch `kind`)
  ratio: Ratio;               // NEU
  label: string;
  imageUrl?: string;
  color?: string;
  caption?: string;
  source?: string;
  tags?: string[];
  score?: number;             // Reflection-Loop-Signal
}

export interface MoodSection { id: string; title: string; items: MoodboardItem[]; }

export interface Moodboard extends Entity {
  type: 'moodboard';
  boardType: BoardType;       // NEU
  client: string;             // NEU (großer Header-Name)
  subtitle: string;           // NEU ("what it is for")
  note: string;               // NEU
  description: string;
  tags: string[];             // NEU
  palette: Color[];           // Hex-Strings der Web-App → { hex } mappen
  fonts: BoardFonts;          // ersetzt das alte `typography?`
  status: 'draft' | 'active' | 'archived';
  attachedCardId?: string;    // Bequemlichkeits-Spiegel der styled_by-Relationship
  sections: MoodSection[];    // ersetzt das flache `items`
  notes: string;
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export interface Asset extends Entity {
  type: 'asset';
  url: string;
  assetKind: 'image' | 'video' | 'audio' | 'pdf' | 'other';
  mimeType?: string;
  tags: string[];
}

// ─── Brand Identity (the layer the vision adds between Knowledge and Decision) ─

export interface Voice {
  tone?: string;
  doList: string[];
  dontList: string[];
}

export interface ThumbnailStyle {
  composition?: string;
  contrast?: string;
  notes?: string;
}

export interface MotionStyle {
  pacing?: string;
  transitions?: string;
  notes?: string;
}

export interface BrandIdentity extends Entity {
  type: 'identity';
  colors: Color[];
  typography: Typography;
  voice: Voice;
  thumbnail?: ThumbnailStyle;
  motion?: MotionStyle;
  hooks: string[];         // recurring hook structures that perform well
  moodboardIds: string[];  // identity is fed by moodboards
}

// ─── Goal (as a first-class entity, beyond a graph-node type) ────────────────

export interface GoalEntity extends Entity {
  type: 'goal';
  description: string;
  targetDate?: Date;
  progress: number; // 0..1
}

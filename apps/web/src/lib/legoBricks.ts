// ─────────────────────────────────────────────────────────────────────────────
// SHORT-FORM VIDEO LEGO BRICKS — the canonical taxonomy.
//
// One short-form video is ASSEMBLED from 11 modular "bricks", and the Master
// Checklist walks those bricks along a 6-stage production line
// (Pre-Script → Script → Record → Edit → Post → Analyze). This module is the
// single source of truth for that taxonomy — mirrors the static-catalog pattern
// of editingCodex.ts.
//
// "Hooks" are NOT a separate system: the Spoken/Visual/Text Hook bricks (+ the
// Audio hook, which lives under Elements → Audio) are the highest-leverage
// sub-system, treated more richly in the Hooks tab (the proven-hook example DB).
//
// Dedup note: Format and Story Structure are 1:1 in the source. We keep ONE
// source — each FORMAT carries its Hero Story Structure steps — and the Story
// Structure brick is DERIVED from the formats (see storyStructureBrick()).
// ─────────────────────────────────────────────────────────────────────────────

export type ProductionStage =
  | 'pre-script'   // Format, Topic, Seed, Substance
  | 'script'       // Spoken/Visual/Text Hook, Story Structure, CTA
  | 'record'       // (recording guidance, no option catalog)
  | 'edit'         // Visual Layout, Elements
  | 'post'         // captions/scheduling
  | 'analyze';     // performance review

export interface BrickOption {
  id: string;
  name: string;
  /** Short definition of the option. */
  description?: string;
  /** Sub-group within the brick (e.g. "Educational", "Subject Motion"). */
  category?: string;
  /** Visual-hook execution starting point. */
  startingPoint?: string;
  /** Example line (spoken hooks, CTAs). */
  example?: string;
  /** Core mechanism (CTAs). */
  coreMechanism?: string;
  /** Ordered Hero Story Structure steps (Format options). */
  storyStructure?: string[];
  /** "These start with …" — the seed a format begins from. */
  startsWith?: string;
}

export interface LegoBrick {
  id: string;
  name: string;
  definition: string;
  stage: ProductionStage;
  /** How many concrete options exist (may be niche-dependent → 0). */
  options: BrickOption[];
  /** Guidance when there is no fixed option catalog (Topic, Seed, Substance). */
  approach?: string;
}

export const PRODUCTION_STAGES: { id: ProductionStage; name: string; description: string; brickIds: string[] }[] = [
  { id: 'pre-script', name: 'Pre-Scripting', description: 'Format & Idea: what the video is and what it says.', brickIds: ['format', 'topic', 'seed', 'substance'] },
  { id: 'script', name: 'Scripting', description: 'Hook, story structure & CTA: how it opens, unfolds and closes.', brickIds: ['spoken-hook', 'visual-hook', 'text-hook', 'story-structure', 'cta'] },
  { id: 'record', name: 'Recording', description: 'Capturing the footage the chosen format needs.', brickIds: [] },
  { id: 'edit', name: 'Editing', description: 'Layout, elements & audio: how it is assembled on screen.', brickIds: ['visual-layout', 'elements'] },
  { id: 'post', name: 'Posting', description: 'Captions & scheduling across platforms.', brickIds: [] },
  { id: 'analyze', name: 'Analyzing', description: 'Reading performance and feeding it back into the next rep.', brickIds: [] },
];

// ─── Brick 1: Format (carries its Story Structure) ───────────────────────────

const FORMATS: BrickOption[] = [
  // Educational
  { id: 'fmt-breakdown', category: 'Educational', name: 'Breakdown/Explainer', description: 'Dissect an event, release or update: what happened, why it matters, your take.', startsWith: 'a topic/concept/event you want to explain', storyStructure: ['Hook (set up "What happened?" via impossible claim, validated outlier, benefit promise or prediction)', 'Rapid Context (clarity on what happened, anchor focus)', 'Core Breakdown/Explanation (the how/why: mechanism reveal, framework, pattern, numerical example)', 'So What (application or personal take — bridge from "interesting" to "useful")', '(Optional) CTA'] },
  { id: 'fmt-case-study', category: 'Educational', name: 'Case Study', description: 'Walk through how a single entity achieved a stated outcome in a specific way.', startsWith: 'an example of success you want to break down', storyStructure: ['Hook ([X subject] achieved [Y outcome] in [Z way])', 'Establish Context (anchor the base case & starting metrics)', 'Core Breakdown/Explanation (1 core playbook or 2-3 things)', 'Key Insight (how it came together, the turning point)', '(Optional) CTA (lesson + comment)'] },
  { id: 'fmt-problem-solution', category: 'Educational', name: 'Problem Solution', description: 'Share a tip or solution to a common problem.', startsWith: "a viewer's problem you want to solve", storyStructure: ['Hook (promise or problem first)', 'Problem Agitation (agitate pain, get buy-in)', 'Core Solution (the actionable insight)', 'Implication (downstream benefits)', '(Optional) CTA'] },
  { id: 'fmt-common-mistake', category: 'Educational', name: 'Common Mistake/Trap', description: 'Call out a mistake the avatar keeps making and what to do instead.', startsWith: 'a trap or mistake the viewer keeps making', storyStructure: ['Hook (call out the trap directly)', 'Trap/Mistake Agitation', 'Trap/Mistake Reveal (why it happens, why the common approach fails)', 'Introduce Correction (tactical fix)', '(Optional) CTA'] },
  { id: 'fmt-tutorial', category: 'Educational', name: 'Tutorial', description: 'Replicate a result through a step-by-step list of actions.', startsWith: 'skills or a process you want to break down in steps', storyStructure: ['Hook (promise a specific outcome via a compelling result)', 'Establish Objective (subject + why it matters)', 'Step by Step Explanation (quickest path to the result)', '(Optional) Implication', '(Optional) CTA'] },
  { id: 'fmt-listicle', category: 'Educational', name: 'Listicle', description: 'A numbered list of items delivered in rapid succession.', startsWith: 'a list of options for accomplishing a task/problem', storyStructure: ['Hook (promise a specific number of items for an on-target problem)', 'Deliver List (each item + quickest path to action)', '(Optional) Implication', '(Optional) CTA'] },
  { id: 'fmt-scenario', category: 'Educational', name: 'Scenario', description: 'A hypothetical scenario framing a creative, outside-the-box answer.', startsWith: 'a hypothetical scenario you want to explore', storyStructure: ['Hook (present the hypothetical scenario)', 'Scenario Context/Baseline (get buy-in)', 'Solution Breakdown (how you handle it, why it beats the conventional way)', '(Optional) Implication', '(Optional) CTA'] },
  { id: 'fmt-comparison', category: 'Educational', name: 'A vs B (vs C) Comparison', description: 'Break down the differences between two/three things.', startsWith: 'a comparison of two or three things', storyStructure: ['Hook (frame the comparison, create stakes)', 'Establish Comparison Criteria', 'Breakdown Each Option (start with something non-obvious)', 'Give Winner (if applicable)', '(Optional) CTA'] },
  { id: 'fmt-qa', category: 'Educational', name: 'Q&A', description: 'Ask and answer a question in the video.', startsWith: "a question you're going to answer", storyStructure: ['Hook (Question hook — ask the initial question)', 'Frame Context (why this matters)', 'Answer Question (typically a breakdown)', '(Optional) Insight/Takeaway', '(Optional) CTA'] },
  { id: 'fmt-ranking', category: 'Educational', name: 'Ranking/Rating/Tier List', description: 'Rate a category of items against each other (S-F tier / 1-5 / 1-10).', startsWith: "a list of options you're comparing to each other", storyStructure: ['Hook (frame the ranking + stakes)', 'Establish the scale/score/game + the items being ranked', 'Rapid Ranking (optional 1 line each)', '(Optional) CTA'] },
  { id: 'fmt-levels', category: 'Educational', name: 'Levels', description: 'Show the 2/3/4 levels of subjects, actions or outcomes in ascending order.', startsWith: 'a set of options presented in ascending order', storyStructure: ['Hook (frame the level ranking + stakes)', 'Establish the items + scale for each level', 'Level Progression (one unique thing per level)', '(Optional) CTA'] },
  { id: 'fmt-reaction', category: 'Educational', name: 'Reaction', description: 'React to an existing piece of content to share perspective or insight.', startsWith: "a base video you're reacting to", storyStructure: ['Hook (play the original clip)', 'Let original clip play', 'Give reaction/take (non-obvious perspective on why it is right or wrong)', '(Optional) CTA'] },
  // Storytelling
  { id: 'fmt-skit', category: 'Storytelling', name: 'Skit/Humor', description: 'Tell a story through a skit or act-out scenario.', startsWith: 'skills or an entertaining/funny scenario', storyStructure: ['Hook (immediate context into what is happening)', 'Set-up scene', 'Back and forth between characters (execute plot)', 'Payoff (unexpected/shocking — closes the loop)', '(Optional) CTA'] },
  { id: 'fmt-heros-journey', category: 'Storytelling', name: "Hero's Journey", description: '1st-person POV transformation arc to solve a problem or overcome a challenge.', startsWith: 'a core problem leading to a transformation arc', storyStructure: ['Hook (frame the origin state / where you started)', 'Establish call to adventure', 'Breakdown the road (struggle, obstacles, failures)', 'Introduce the transformation (the dramatic after)', 'Show the after (new reality unlocked)', '(Optional) CTA'] },
  { id: 'fmt-epiphany', category: 'Storytelling', name: 'Personal Learning/Epiphany', description: 'Frame a personal victory, then teach how it was achieved.', startsWith: 'a core learning the creator wants to share', storyStructure: ['Hook (specific tease that proof is coming)', 'Establish desired result (with proof)', 'Explain before state (humble starting point)', 'Explain process to transformation reveal', '(Optional) Lesson epiphanies', '(Optional) CTA'] },
  { id: 'fmt-day-in-life', category: 'Storytelling', name: 'Day In The Life', description: 'A day-in-the-life scenario from a 1st-person POV.', startsWith: "skills or a day's worth of events", storyStructure: ['Hook (set up scenario and character)', 'Establish Context & Relatable Chaos', 'Breakdown Daily Routine (rituals, workflow)', 'Add Reflection (your take & lessons)', '(Optional) CTA'] },
  { id: 'fmt-personal-update', category: 'Storytelling', name: 'Personal Update', description: 'Share a personal update in your life or mission (1st-person POV).', startsWith: 'an update the creator wants to share', storyStructure: ['Hook (lead with the update)', 'Establish context on you and situation', 'Give the update details (tension/conflict)', 'Rationalize decision (the why)', '(Optional) CTA'] },
  { id: 'fmt-about-me', category: 'Storytelling', name: 'About Me', description: "Personal backstory explaining the 'why' behind the brand or mission.", startsWith: 'a background or original story the creator wants to tell', storyStructure: ['Hook (who you are; subject, setting, conditions)', 'Establish context on normal life', 'Introduce epiphany or change moment', 'Break down how it impacted your go-forward path', '(Optional) CTA'] },
  { id: 'fmt-episode', category: 'Storytelling', name: 'Episode Series/Social Show', description: 'An adventure or plot-driven episode of a show.', startsWith: 'an episode in a broader story the brand/creator wants to tell', storyStructure: ['Hook (declare the core mission of the episode)', 'Establish context for the episode', 'Build plot arc', 'Resolution or Cliffhanger', '(Optional) CTA'] },
  { id: 'fmt-challenge', category: 'Storytelling', name: 'Challenge', description: 'Framed as a challenge to accomplish some mission or task.', startsWith: 'a challenge the creator has done or is doing', storyStructure: ['Hook (establish challenge setting/scenario)', 'Establish context in challenge', 'Build plot arc (conflicts, obstacles)', 'Resolution or Cliffhanger'] },
];

// ─── Brick 5: Spoken Hook (canonical 8 structures; maps the Lego 13) ──────────
// The Hooks tab + ingestion classify into these 8. The Lego-Bricks doc lists 13
// finer formats; each maps onto one of the 8 (mappedFrom) so the two vocabularies
// stay reconciled rather than duplicated.

export interface SpokenHookStructure extends BrickOption {
  /** Finer Lego-Bricks spoken-hook formats that roll up into this structure. */
  mappedFrom?: string[];
}

const SPOKEN_HOOKS: SpokenHookStructure[] = [
  { id: 'sh-secret-reveal', name: 'Secret Reveal', description: 'Reveal a secret, hidden truth or finding you came across.', example: "There's a backpack brand nobody knows about but all the celebrities are wearing", mappedFrom: ['Secret Reveal / Breakdown'] },
  { id: 'sh-fortuneteller', name: 'Fortuneteller', description: 'Curiosity loop comparing the present to a new future because of something that happened.', example: 'This backpack is going to change how people hike in the future' },
  { id: 'sh-experimentation', name: 'Experimentation', description: 'Frame a practical pain point solved live through an example/experiment.', example: 'You can pack more hiking equipment in your backpack, if you just do this…' },
  { id: 'sh-educational', name: 'Educational/Tutorial', description: 'Frame a pain point solved through a method/tool you are teaching.', example: 'If you want to fit more in your backpack, use the 2-1-3 method', mappedFrom: ['Education', 'Case Study', 'Problem', 'List'] },
  { id: 'sh-contrarian', name: 'Contrarian/Negative', description: 'Immediately state a non-obvious belief or myth-bust in the first line.', example: 'People spend way too much time obsessing over their backpack design', mappedFrom: ['Contrarian', 'Negative'] },
  { id: 'sh-comparison', name: 'Comparison', description: 'Compare many versions of something against each other.', example: 'These are the top 5 hiking backpack brands… but which one is actually best?', mappedFrom: ['Comparison', 'Ranking/Rating', 'Scenario/Hypothetical'] },
  { id: 'sh-question', name: 'Question', description: "Pose an intriguing question the viewer is stuck thinking about.", example: 'Why are so many people wearing this backpack when they go hiking?' },
  { id: 'sh-raw-shock', name: 'Raw Shock', description: 'Instant scroll-stop word/action/sound; can combine with any of the above.', example: 'See this bag…', mappedFrom: ['Authority', 'Personal Experience'] },
];

// ─── Brick 6: Visual Hook (46 formats, 5 categories) ─────────────────────────

const VISUAL_HOOKS: BrickOption[] = [
  // Subject Motion
  { id: 'vh-1', category: 'Subject Motion', name: 'Point To Visual', startingPoint: 'Start with creator on screen, then use finger to point to focus visual.' },
  { id: 'vh-2', category: 'Subject Motion', name: 'Move In Frame', startingPoint: 'Creator walks into or around the frame to give motion to the eye.' },
  { id: 'vh-3', category: 'Subject Motion', name: 'Camera Whip', startingPoint: 'Fast camera whip motion to create initial stun.' },
  { id: 'vh-4', category: 'Subject Motion', name: 'Jump In', startingPoint: 'Creator comes into the screen from the side.' },
  { id: 'vh-5', category: 'Subject Motion', name: 'Snap/Pop Reveal', startingPoint: 'A visual signature reveal to appear in the frame.' },
  { id: 'vh-6', category: 'Subject Motion', name: 'Clone Body Double', startingPoint: 'Film yourself twice; both versions appear at once (optionally animate one).' },
  { id: 'vh-7', category: 'Subject Motion', name: 'Fly on Wall', startingPoint: 'Subject looks off screen (common in podcast-style clips).' },
  { id: 'vh-8', category: 'Subject Motion', name: 'Anticipated Disaster', startingPoint: 'Clip of a dangerous thing about to happen to the subject; fast switch/stitch.' },
  { id: 'vh-9', category: 'Subject Motion', name: 'Object Catch', startingPoint: 'Catch item thrown into frame.' },
  { id: 'vh-10', category: 'Subject Motion', name: 'Using Random Product (Pope In The Pool)', startingPoint: 'Random item/task as a subconscious visual distraction.' },
  { id: 'vh-11', category: 'Subject Motion', name: 'Setting Down Phone', startingPoint: 'Set down the recording device as the video starts.' },
  { id: 'vh-12', category: 'Subject Motion', name: 'Holding Prop', startingPoint: 'Start holding/looking at a prop that becomes the POV focus.' },
  { id: 'vh-13', category: 'Subject Motion', name: 'Many of Same Prop', startingPoint: 'Multiple items, similar or different.' },
  { id: 'vh-14', category: 'Subject Motion', name: 'Framebreaker', startingPoint: 'Remove background from initial visual and overlay so subject breaks the frame.' },
  { id: 'vh-15', category: 'Subject Motion', name: 'Jump Switch', startingPoint: 'Creator jumps; on landing the scene changes.' },
  { id: 'vh-16', category: 'Subject Motion', name: '3P Crash Zoom', startingPoint: 'Shot of another person in the distance while zooming in.' },
  { id: 'vh-17', category: 'Subject Motion', name: 'Fridge POV', startingPoint: 'Camera in fridge/cabinet/aisle; remove item/open door to reveal creator.' },
  { id: 'vh-18', category: 'Subject Motion', name: 'Write on Screen', startingPoint: 'Marker to write text on the camera lens / animate text.' },
  { id: 'vh-19', category: 'Subject Motion', name: 'Mirror', startingPoint: 'Creator talks to the audience from a mirror reflection.' },
  // Graphic/Text Overlays
  { id: 'vh-20', category: 'Graphic/Text Overlays', name: 'A vs B Comparison Graphics', startingPoint: 'Graphics to showcase A vs B of something.' },
  { id: 'vh-21', category: 'Graphic/Text Overlays', name: 'Text Slide In', startingPoint: 'Title text slides into the video.' },
  { id: 'vh-22', category: 'Graphic/Text Overlays', name: 'Interactive Title', startingPoint: 'Title text creates motion by entering in an interesting way.' },
  { id: 'vh-23', category: 'Graphic/Text Overlays', name: 'Text/Arrow Pointer', startingPoint: 'Text + arrow directing attention at a visual while explaining it.' },
  { id: 'vh-24', category: 'Graphic/Text Overlays', name: 'Small Image Drop Overlay', startingPoint: 'Drop a small image onto a larger one and integrate.' },
  { id: 'vh-25', category: 'Graphic/Text Overlays', name: 'Screen Recording w/ Motion', startingPoint: 'Screen recording using motion to aim attention.' },
  { id: 'vh-26', category: 'Graphic/Text Overlays', name: 'Image Overlay Motion', startingPoint: 'An image (with/without motion) + text to begin.' },
  { id: 'vh-27', category: 'Graphic/Text Overlays', name: 'Countdown', startingPoint: 'Count down 3, 2, 1 before revealing something.' },
  // Visual Selection
  { id: 'vh-28', category: 'Visual Selection', name: 'High Motion Base B-Roll', startingPoint: 'Core base visuals have high motion embedded.' },
  { id: 'vh-29', category: 'Visual Selection', name: 'Unusual First Image/Scene', startingPoint: 'Full-screen image that visually breaks conventional pattern.' },
  { id: 'vh-30', category: 'Visual Selection', name: 'Silent Reaction PIP', startingPoint: 'Creator watches a base clip silently, then reacts.' },
  { id: 'vh-31', category: 'Visual Selection', name: 'Visual Mistake', startingPoint: 'Add something unexpected (looks like an error/glitch) to the frame.' },
  // Pattern Interrupt / Visual Switching
  { id: 'vh-32', category: 'Pattern Interrupt / Switching', name: 'Viral Stitch Linked Reaction', startingPoint: 'Start with a viral clip, react to it as a transition into your video.' },
  { id: 'vh-33', category: 'Pattern Interrupt / Switching', name: 'Match Cut', startingPoint: 'Rapid series of visuals/text that line up.' },
  { id: 'vh-34', category: 'Pattern Interrupt / Switching', name: 'Visual Switch', startingPoint: 'Action in shot 1 cleanly transitions to shot 2.' },
  { id: 'vh-35', category: 'Pattern Interrupt / Switching', name: 'Beat Match Visual Switch', startingPoint: 'Clip timing matched to the beat of the song.' },
  { id: 'vh-36', category: 'Pattern Interrupt / Switching', name: 'Viral Stitch Motion Match', startingPoint: 'Start with a viral clip, then match-cut your own motion.' },
  { id: 'vh-37', category: 'Pattern Interrupt / Switching', name: 'Viral Stitch Unlinked Switch', startingPoint: 'Viral clip (high anticipation), then cold switch to your brand/business.' },
  // Visual Effect / Transition
  { id: 'vh-38', category: 'Visual Effect / Transition', name: 'Speed Ramp Effect', startingPoint: 'Speed-ramp transition from shot 1 to shot 2.' },
  { id: 'vh-39', category: 'Visual Effect / Transition', name: 'The Zoom In', startingPoint: 'Slow zoom in on creator.' },
  { id: 'vh-40', category: 'Visual Effect / Transition', name: 'Look Up At Camera // Top Down', startingPoint: 'Camera up in the corner of a room for a different look.' },
  { id: 'vh-41', category: 'Visual Effect / Transition', name: 'Sudden Danger 1P POV', startingPoint: 'Clip of a dangerous thing about to happen to the viewer; fast switch/stitch.' },
  { id: 'vh-42', category: 'Visual Effect / Transition', name: 'Fish Eye', startingPoint: 'Fish-eye lens for a different look.' },
  { id: 'vh-43', category: 'Visual Effect / Transition', name: 'Frame Collapse', startingPoint: 'Collapse top/bottom of the frame to reveal an aspect ratio, timed with the beat.' },
  { id: 'vh-44', category: 'Visual Effect / Transition', name: 'Crazy Transitions', startingPoint: 'High-motion editing transitions/templates in CapCut.' },
  { id: 'vh-45', category: 'Visual Effect / Transition', name: 'Experimental (Interactive)', startingPoint: 'Motion graphics suggesting thumb movement, edited to match.' },
  { id: 'vh-46', category: 'Visual Effect / Transition', name: 'Color Switch', startingPoint: 'Start at 0 saturation, change to full color on tap/beat.' },
];

// ─── Brick 7: Text Hook (10 formats) ─────────────────────────────────────────

const TEXT_HOOKS: BrickOption[] = [
  // Substance (what the title says)
  { id: 'th-benefit', category: 'Substance (Title Text)', name: 'Stated Benefit/Outcome', description: 'Emphasizes the outcome/benefit from the core subject.' },
  { id: 'th-subject', category: 'Substance (Title Text)', name: 'Video Subject', description: 'Reiterates the subject of the video.' },
  { id: 'th-takeaway', category: 'Substance (Title Text)', name: 'Core Takeaway', description: 'Emphasizes the core takeaway from the video.' },
  { id: 'th-question', category: 'Substance (Title Text)', name: 'Core Question', description: 'Emphasizes the core question the video will answer.' },
  { id: 'th-series', category: 'Substance (Title Text)', name: 'Series Name', description: 'Labels the name of a series.' },
  { id: 'th-avb-labels', category: 'Substance (Title Text)', name: 'A vs B Comparison Labels', description: 'Label the A vs B comparison scenario.' },
  // Layout / Motion (how it looks) — canonical caption styles live in Elements → Captions
  { id: 'th-core-topic', category: 'Layout/Motion', name: 'Core Topic (Single Font, Solid BG)', description: 'Core topic in plain font on a color background.' },
  { id: 'th-dual-font', category: 'Layout/Motion', name: 'Core Message (Dual Font)', description: 'Core message in dual font at the top of the screen.' },
  { id: 'th-designed', category: 'Layout/Motion', name: 'Core Takeaway (Designed Aesthetic)', description: 'Core takeaway in a single aesthetic font.' },
  { id: 'th-music-words', category: 'Layout/Motion', name: 'Words Added Via Music (Dual Font)', description: 'Title text added as the music hits the beat.' },
];

// ─── Brick 9: CTA (10 formats, 3 groups) ─────────────────────────────────────

const CTAS: BrickOption[] = [
  { id: 'cta-value-promise', category: 'Follow', name: 'Value Promise', coreMechanism: '"I teach X, follow for more"', example: 'Follow for more (industry) education!' },
  { id: 'cta-transformation', category: 'Follow', name: 'Transformation Story', coreMechanism: '"I achieved X, follow to learn how"', example: "I went from (pain) to (result) in X days — I don't gatekeep, follow for my secrets!" },
  { id: 'cta-avatar', category: 'Follow', name: 'Avatar-Targeted', coreMechanism: '"If you\'re [type], follow"', example: 'Are you a (avatar) looking to achieve (result)? Follow for more!' },
  { id: 'cta-save', category: 'Engagement', name: 'Save', coreMechanism: '"Save for later"', example: "Save this so the next time X happens you're prepared!" },
  { id: 'cta-tag', category: 'Engagement', name: 'Tag', coreMechanism: '"Tag someone who needs this"', example: 'Tag someone below who needs to hear this!' },
  { id: 'cta-comment', category: 'Engagement', name: 'Comment/Opinion', coreMechanism: '"Drop your take below"', example: 'Comment below your opinion on X!' },
  { id: 'cta-lead-magnet', category: 'Leads', name: 'Lead Magnet Offer', coreMechanism: '"Comment/DM for free [resource]"', example: 'Comment X for (lead magnet)!' },
  { id: 'cta-comment-info', category: 'Leads', name: 'Comment-for-Info', coreMechanism: '"Comment X for details"', example: "Interested? Comment 'X' and I'll send you more info!" },
  { id: 'cta-transformation-trigger', category: 'Leads', name: 'Transformation + Trigger', coreMechanism: 'Story + "Comment X"', example: 'I went from (pain) to (result) in X days — want the same? Comment X!' },
  { id: 'cta-offer-pitch', category: 'Leads', name: 'Offer/Service Pitch', coreMechanism: 'Direct service pitch', example: 'I created (service) so you can achieve (result) in a fraction of the time!' },
];

// ─── Brick 10: Visual Layout (31 layouts, 6 categories) ──────────────────────

const VISUAL_LAYOUTS: BrickOption[] = [
  { id: 'vl-1', category: 'Studio/Set', name: 'Full Screen/Hybrid', description: 'Full-screen A-roll in studio, cutting to full-screen b-roll visuals.' },
  { id: 'vl-2', category: 'Studio/Set', name: 'Split Screen', description: 'Frame divided; one side product/software demo, other side creator narrating.' },
  { id: 'vl-3', category: 'Studio/Set', name: 'Whiteboard', description: 'Full-screen A-roll with a whiteboard used to explain a concept.' },
  { id: 'vl-4', category: 'Studio/Set', name: 'Comparison/Clone', description: 'Two versions of the subject doing different things.' },
  { id: 'vl-5', category: 'Studio/Set', name: 'Office/Room Yap', description: 'Full-screen creator talking to camera, no extra visuals.' },
  { id: 'vl-6', category: 'Studio/Set', name: 'Car Yap', description: 'Talking-head commentary from inside a car.' },
  { id: 'vl-7', category: 'Studio/Set', name: 'Podcast Clips', description: 'Creator in a real or fake podcast conversation.' },
  { id: 'vl-8', category: 'Greenscreen', name: 'Visual Greenscreen', description: 'Greenscreen removes background; creator overlaid on images/videos/screen recordings.' },
  { id: 'vl-9', category: 'Greenscreen', name: 'Notes/Article Greenscreen', description: 'Apple Notes screenshot fills the screen; bullets typed as creator narrates.' },
  { id: 'vl-10', category: 'Greenscreen', name: 'Reaction', description: 'Creator reacting to content like videos or music.' },
  { id: 'vl-11', category: 'Faceless', name: 'Faceless Reaction Explainer', description: 'B-roll from other accounts hooks, then transitions into a spoken explainer.' },
  { id: 'vl-12', category: 'Faceless', name: 'Faceless Physical Explainer', description: 'B-roll where creator uses graphics/words printed on paper/props.' },
  { id: 'vl-13', category: 'Faceless', name: 'Faceless Clipping (Movie/TV)', description: 'B-roll from movies, TV shows, interviews.' },
  { id: 'vl-14', category: 'Faceless', name: 'Faceless Visual Explainer', description: 'Core visuals made by creator or AI-generated clips.' },
  { id: 'vl-15', category: 'Faceless', name: 'Faceless Gameplay Narration', description: 'Gameplay footage + voiceover story + text overlays.' },
  { id: 'vl-16', category: 'Faceless', name: 'Faceless Text Conversation', description: 'Story through on-screen text messages between parties.' },
  { id: 'vl-17', category: 'Faceless', name: 'Faceless Animation', description: 'Full-screen animated graphics/visuals with narration.' },
  { id: 'vl-18', category: 'In-World (Vlog)', name: 'Vlog Reflective (Voiceover Only)', description: 'In-world clips (no audio) + voiceover added in edit.' },
  { id: 'vl-19', category: 'In-World (Vlog)', name: 'Vlog Interactive (Direct Only)', description: 'In-world clips talking to camera, stitched into a story.' },
  { id: 'vl-20', category: 'In-World (Vlog)', name: 'Vlog Hybrid (Direct + Voiceover)', description: 'Mix of to-camera clips and voiceover.' },
  { id: 'vl-21', category: 'In-World (Vlog)', name: 'Vlog Music (No Spoken Audio)', description: 'In-world clips, only background music.' },
  { id: 'vl-22', category: 'In-World (Vlog)', name: 'Vlog POV (No Spoken Audio)', description: "Shot from the creator's own viewpoint." },
  { id: 'vl-23', category: 'In-World (Vlog)', name: 'Vlog Timelapse', description: 'A lengthy task/transformation sped up start to finish.' },
  { id: 'vl-24', category: 'In-World (Vlog)', name: 'Man on Street (Single Interview)', description: 'Interview a single person on the street.' },
  { id: 'vl-25', category: 'In-World (Vlog)', name: 'Man on Street (Multiple Interviews)', description: 'Quick cuts between multiple street interviews.' },
  { id: 'vl-26', category: 'In-World (Skit)', name: 'Skit (Group)', description: 'Skit with multiple characters.' },
  { id: 'vl-27', category: 'In-World (Skit)', name: 'Skit (Solo)', description: 'Skit with multiple versions of yourself.' },
  { id: 'vl-28', category: 'In-World (Skit)', name: 'Skit (Lip-Sync)', description: 'Skit by lip-syncing to the audio.' },
  { id: 'vl-29', category: 'In-World (Skit)', name: 'Skit (Transformation Reveal)', description: 'Skit with a transformation reveal.' },
  { id: 'vl-30', category: 'Other', name: 'Static Image/Slideshow', description: 'Still images in sequence with text overlays.' },
  { id: 'vl-31', category: 'Other', name: 'Stop-Motion', description: 'Still photos/minimal frames stitched into an animated effect.' },
];

// ─── Brick 11: Elements (A-roll, B-roll, Captions, Graphics, Edits, Audio) ────

const ELEMENTS: BrickOption[] = [
  // A-roll
  { id: 'el-aroll-studio', category: 'A-roll', name: 'In Studio/Set (Face to Camera)' },
  { id: 'el-aroll-studio-prop', category: 'A-roll', name: 'In Studio/Set w/ Prop (Face to Camera)' },
  { id: 'el-aroll-studio-off', category: 'A-roll', name: 'In Studio/Set (Looking Off Camera)' },
  { id: 'el-aroll-world', category: 'A-roll', name: 'In World (Face to Camera)' },
  { id: 'el-aroll-world-off', category: 'A-roll', name: 'In World (Looking Off Camera)' },
  { id: 'el-aroll-whiteboard', category: 'A-roll', name: 'Whiteboard Direct (Face to Camera)' },
  // B-roll
  { id: 'el-broll-subject', category: 'B-roll', name: 'In-World Subject' },
  { id: 'el-broll-product', category: 'B-roll', name: 'In-World Product/Props' },
  { id: 'el-broll-overhead', category: 'B-roll', name: 'Overhead/Angle Shots' },
  { id: 'el-broll-repurposed', category: 'B-roll', name: 'Repurposed Clips' },
  { id: 'el-broll-ai', category: 'B-roll', name: 'AI Generated' },
  { id: 'el-broll-screen', category: 'B-roll', name: 'Screen Recordings' },
  // Captions (single canonical home — Text Hook references these)
  { id: 'el-cap-standard', category: 'Captions', name: 'Standard Small Captions', description: 'Sit ~⅓–½ from the bottom, change word-for-word or 2-3 words at a time.' },
  { id: 'el-cap-tracking', category: 'Captions', name: 'Tracking Captions (Word for Word)', description: 'Track with the visuals as they move around the screen.' },
  { id: 'el-cap-integrated', category: 'Captions', name: 'Integrated in Scene', description: "Don't move; placed and colored to complement the scene." },
  { id: 'el-cap-first-few', category: 'Captions', name: 'First Few Locked, Next 1-by-1 (Spatial)', description: 'First words start on screen, next added as said.' },
  { id: 'el-cap-plain-top', category: 'Captions', name: 'Full Sentence, Plain (Top)', description: 'Conventional TikTok title text locked to the top.' },
  // Text Motion Graphics
  { id: 'el-tmg-large', category: 'Text Motion Graphics', name: 'Large Text Graphic Overlays' },
  { id: 'el-tmg-small', category: 'Text Motion Graphics', name: 'Small/Simple Text Graphic Overlays' },
  { id: 'el-tmg-full', category: 'Text Motion Graphics', name: 'Full Screen Text Graphics' },
  // Visual Motion Graphics
  { id: 'el-vmg-full', category: 'Visual Motion Graphics', name: 'Full Screen Visual Graphics' },
  { id: 'el-vmg-full-text', category: 'Visual Motion Graphics', name: 'Full Screen Visual + Text Graphics' },
  { id: 'el-vmg-floating', category: 'Visual Motion Graphics', name: 'Floating Graphic/Image Overlay' },
  // Edits / Transitions
  { id: 'el-edit-basics', category: 'Edits/Transitions', name: 'Basics', description: 'Zooms, cuts, slides, 3D tilt/swivel, highlights, darken/blur.' },
  { id: 'el-edit-advanced', category: 'Edits/Transitions', name: 'Advanced', description: 'After Effects transitions/visuals (unlimited).' },
  // Audio (the 4th hook component lives here)
  { id: 'el-audio-none', category: 'Audio', name: 'No Audio', description: 'Zero music, zero SFX.' },
  { id: 'el-audio-music', category: 'Audio', name: 'Music Only', description: 'Backing track, no SFX.' },
  { id: 'el-audio-sfx', category: 'Audio', name: 'SFX Only', description: 'No backing track, with SFX.' },
  { id: 'el-audio-both', category: 'Audio', name: 'Music + SFX', description: 'Both music and SFX.' },
];

// ─── The 11 bricks ───────────────────────────────────────────────────────────

/** Story Structure is derived from the formats (1:1) — no duplicated source. */
function storyStructureOptions(): BrickOption[] {
  return FORMATS.map((f) => ({
    id: `ss-${f.id}`,
    name: f.name,
    category: f.category,
    description: `Hero Story Structure for the ${f.name} format.`,
    storyStructure: f.storyStructure,
  }));
}

export const LEGO_BRICKS: LegoBrick[] = [
  { id: 'format', name: 'Format', stage: 'pre-script', definition: 'The high-level structure of the video — the canvas being painted on. 12 core educational + 8 storytelling formats.', options: FORMATS },
  { id: 'topic', name: 'Topic', stage: 'pre-script', definition: 'The interest topic/subject focus of the video. Niche-dependent.', options: [], approach: 'Follow the data-driven Idea process to find the top-performing interest topics for your niche.' },
  { id: 'seed', name: 'Seed', stage: 'pre-script', definition: 'The one-line headline or premise of the video. Changes every video.', options: [], approach: 'Relevant to your IVA, carries useful substance, a non-obvious/unique perspective, and is genuinely interesting or shocking to you.' },
  { id: 'substance', name: 'Substance', stage: 'pre-script', definition: 'The context/facts, angles/takes or examples framed in a shocking, non-obvious or interesting way.', options: [ { id: 'sub-facts', name: 'Facts', description: 'True statements about the topic.' }, { id: 'sub-takes', name: 'Opinions/Takes/Angles', description: 'Your analysis, opinions or learnings.' }, { id: 'sub-examples', name: 'Examples', description: 'Scenarios or metaphors to help explain.' }, { id: 'sub-visuals', name: 'Visuals', description: 'Imagery complementing facts, opinions and examples.' } ] },
  { id: 'spoken-hook', name: 'Spoken Hook', stage: 'script', definition: 'What you say verbally in the first 3-5 seconds. 3rd of the 4 hook components. Canonical 8 structures (the finer Lego-Bricks formats roll up into these).', options: SPOKEN_HOOKS },
  { id: 'visual-hook', name: 'Visual Hook', stage: 'script', definition: 'What you show on screen in the first 3-5 seconds. The MOST important hook component (consumed first). 46 formats across 5 categories.', options: VISUAL_HOOKS },
  { id: 'text-hook', name: 'Text Hook', stage: 'script', definition: 'The text shown in the first 3-5 seconds (may differ from the spoken words). 2nd of the 4 hook components.', options: TEXT_HOOKS },
  { id: 'story-structure', name: 'Story Structure', stage: 'script', definition: 'The detailed sequencing of how the story is told. 1:1 with Format — each format has its Hero Story Structure.', options: storyStructureOptions() },
  { id: 'cta', name: 'CTA', stage: 'script', definition: 'The (optional) call-to-action at the end. 10 formats across Follow / Engagement / Leads.', options: CTAS },
  { id: 'visual-layout', name: 'Visual Layout', stage: 'edit', definition: 'The combination of layouts for how visual elements are displayed on screen. 31 layouts across 6 categories.', options: VISUAL_LAYOUTS },
  { id: 'elements', name: 'Elements', stage: 'edit', definition: 'The visual elements (A-roll, B-roll, captions, graphics, edits) and the audio elements (music, SFX). The Audio Hook — the 4th hook component — lives here.', options: ELEMENTS },
];

// ─── Master Checklist — the 6-stage production gates ─────────────────────────

export interface ChecklistGate {
  id: string;
  stage: ProductionStage;
  question: string;
}

export const MASTER_CHECKLIST: ChecklistGate[] = [
  { id: 'chk-format-datadriven', stage: 'pre-script', question: 'Do you have outlier data suggesting this format is outperforming in your niche in the last 3 months?' },
  { id: 'chk-idea-data', stage: 'pre-script', question: 'Is there proven data that this interest topic and idea seed have already outperformed for your IVA?' },
  { id: 'chk-idea-value', stage: 'pre-script', question: 'Is it reasonable to expect your IVA gets tactical, non-obvious value from what you plan to cover?' },
  { id: 'chk-shock', stage: 'pre-script', question: 'If 100 of your core IVAs saw this, would 90+ have never heard it before and be able to act on it within 24h?' },
  { id: 'chk-hook-ontarget', stage: 'script', question: 'On-target: is the hook setting context for a topic aligned with your IVA\'s interests?' },
  { id: 'chk-hook-curiosity', stage: 'script', question: 'Curiosity loop: does the hook pop the right question and drive significant contrast?' },
  { id: 'chk-hook-alignment', stage: 'script', question: 'Alignment: are all 4 hook components (spoken, visual, text, audio) optimally aligned?' },
  { id: 'chk-hook-validated', stage: 'script', question: 'Are the hook components validated by high-performing data on your or a competitor\'s channel?' },
  { id: 'chk-speed-to-value', stage: 'script', question: 'Did you get to the first point of the body in under 4 seconds?' },
  { id: 'chk-cta', stage: 'script', question: 'Have you included the necessary native CTA embeds?' },
  { id: 'chk-rec-equipment', stage: 'record', question: 'Was all equipment on and working (lights, audio, video), audio clean and level, video in focus and centered?' },
  { id: 'chk-rec-broll', stage: 'record', question: 'Did you record all the b-roll shots your chosen format needs?' },
  { id: 'chk-edit-hook', stage: 'edit', question: 'Effective visual hook: title text + interesting motion visual + spoken-word combo, complementary?' },
  { id: 'chk-edit-pacing', stage: 'edit', question: 'Is the visual switching and delivery pacing fast enough? (Eyes closed — do you get bored?)' },
  { id: 'chk-edit-layout', stage: 'edit', question: 'Best combination of visual layouts for maximum absorption and comprehension?' },
  { id: 'chk-post-captions', stage: 'post', question: 'Captions written and videos scheduled across all relevant platforms?' },
  { id: 'chk-analyze-outlier', stage: 'analyze', question: 'Is this a 10x+ outlier vs the average? What did you do differently — and what one change will you focus on next?' },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

export const brickById = (id: string): LegoBrick | undefined => LEGO_BRICKS.find((b) => b.id === id);
export const bricksForStage = (stage: ProductionStage): LegoBrick[] => LEGO_BRICKS.filter((b) => b.stage === stage);
export const checklistForStage = (stage: ProductionStage): ChecklistGate[] => MASTER_CHECKLIST.filter((c) => c.stage === stage);

/** Canonical spoken-hook structure names — shared vocabulary with ingestion HOOK_PATTERNS. */
export const SPOKEN_HOOK_NAMES = SPOKEN_HOOKS.map((h) => h.name);
/** Canonical format names — shared vocabulary with ingestion FORMATS. */
export const FORMAT_NAMES = FORMATS.map((f) => f.name);

// ─── Pipeline composer (Phase 3) ─────────────────────────────────────────────
// The subset of bricks a creator picks per pipeline card to compose a video.
// Stored on pipeline_cards.bricks; each value is a chosen option name.

export interface CardBricks {
  format?: string;
  spokenHook?: string;
  visualHook?: string;
  textHook?: string;
  storyStructure?: string;
  cta?: string;
  visualLayout?: string;
  audio?: string;
}

/** The bricks exposed in the card composer, in production order. */
export const COMPOSER_BRICKS: { key: keyof CardBricks; brickId: string; label: string; category?: string }[] = [
  { key: 'format', brickId: 'format', label: 'Format' },
  { key: 'spokenHook', brickId: 'spoken-hook', label: 'Spoken Hook' },
  { key: 'visualHook', brickId: 'visual-hook', label: 'Visual Hook' },
  { key: 'textHook', brickId: 'text-hook', label: 'Text Hook' },
  { key: 'storyStructure', brickId: 'story-structure', label: 'Story Structure' },
  { key: 'cta', brickId: 'cta', label: 'CTA' },
  { key: 'visualLayout', brickId: 'visual-layout', label: 'Visual Layout' },
  { key: 'audio', brickId: 'elements', label: 'Audio', category: 'Audio' },
];

/** Option names available for a composer brick (filtered by category when set). */
export function composerOptions(entry: (typeof COMPOSER_BRICKS)[number]): string[] {
  const brick = brickById(entry.brickId);
  if (!brick) return [];
  const opts = entry.category ? brick.options.filter((o) => o.category === entry.category) : brick.options;
  return opts.map((o) => o.name);
}

/** The Master Checklist as fresh, unchecked pipeline-card checklist items. */
export function masterChecklistItems(): { id: string; text: string; done: boolean }[] {
  const stageName = new Map(PRODUCTION_STAGES.map((s) => [s.id, s.name]));
  return MASTER_CHECKLIST.map((g) => ({
    id: `chk-${g.id}`,
    text: `[${stageName.get(g.stage) ?? g.stage}] ${g.question}`,
    done: false,
  }));
}

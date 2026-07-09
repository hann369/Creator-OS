export interface CodexEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
}

export const EDITING_CODEX: CodexEntry[] = [
  {
    id: "edit-recipe",
    category: "Core Editing Theory",
    title: "Editing Recipe: Story - Emotion - Rhythm",
    content: "The ultimate recipe for editing prioritizes elements in this order:\n1. Story: What is the narrative progression? What is changing?\n2. Emotion: What is the viewer feeling? Happiness, Anger, Sadness?\n3. Rhythm: Pacing of cuts, slow cuts for intense emotions, variety, and smooth invisible cuts.",
    tags: ["recipe", "core", "emotion", "story", "rhythm"]
  },
  {
    id: "show-dont-tell",
    category: "Core Editing Theory",
    title: "Show, Don't Tell",
    content: "Make the audience put things together. Do not explain everything verbally; let them derive the meaning from visual progression and juxtaposition.",
    tags: ["storytelling", "show-dont-tell", "visual"]
  },
  {
    id: "drama-conflict",
    category: "Core Editing Theory",
    title: "Drama as the Foundation",
    content: "Drama is the foundation of every Story. It consists of conflicts and reactions to conflicts. Look out for silent moments, eyes, emotions, and facial expressions.",
    tags: ["drama", "conflict", "reaction", "emotion"]
  },
  {
    id: "acts-scenes-beats",
    category: "Structural Editing",
    title: "Acts, Scenes, Beats, Frames: Big to Small",
    content: "Always think big first, then small when structuring an edit:\n- Acts: Set up character and world -> Challenge -> Payoff, or Problem -> Problem Solving -> Connection.\n- Scenes: What do characters want in this moment? Small shifts in story, location, characters, or time.\n- Beats and Microbeats: Actions and choices done by characters in a scene.\n- Frames: The micro-timing of the edits.",
    tags: ["structure", "acts", "scenes", "beats"]
  },
  {
    id: "heroes-journey",
    category: "Structural Editing",
    title: "The Hero's Journey (12 Steps)",
    content: "1. Ordinary World\n2. Call to Adventure\n3. Refusal of the Call\n4. Meeting the Mentor\n5. Crossing the Threshold\n6. Tests, Allies, and Enemies\n7. The Approach\n8. The Ordeal\n9. The Reward\n10. The Road Back\n11. The Resurrection (Climax)\n12. The Return with Elixir",
    tags: ["structure", "storytelling", "framework"]
  },
  {
    id: "harmon-circle",
    category: "Structural Editing",
    title: "The Harmon Circle (8 Steps)",
    content: "1. Comfort Zone\n2. They desire Something\n3. Unfamiliar Situation\n4. Adapt to Situation\n5. Get what they want\n6. Pay a heavy price\n7. Back to familiar situation\n8. Change",
    tags: ["structure", "storytelling", "framework"]
  },
  {
    id: "pope-in-the-pool",
    category: "Structural Editing",
    title: "The Pope in the Pool",
    content: "Add an extra entertaining element in the introduction to keep the viewer engaged while you are delivering necessary exposition or backstory.",
    tags: ["retention", "hook", "exposition"]
  },
  {
    id: "ab-plots",
    category: "Structural Editing",
    title: "A and B Plots",
    content: "A-Plot is the focus of the story. B-Plot supports the A-Plot. Ensure the B-Story is as interesting as the A-Story to keep the pacing dynamic.",
    tags: ["structure", "plot", "storyline"]
  },
  {
    id: "eye-tracing",
    category: "Editing Techniques & Effects",
    title: "Eye Tracing Theory",
    content: "Manage the viewer's attention by tracking where they look in the frame. The position of interest in the next shot should be close to the prior shot. This builds seamless, intentional edits and avoids 'micro-confusion' when viewers have to refocus their eyes. Use contrast (e.g. light against dark background) or movement to guide attention.",
    tags: ["visual", "technique", "flow", "eyetrace"]
  },
  {
    id: "kuleshov-effect",
    category: "Editing Techniques & Effects",
    title: "Kuleshov Effect & Montage Theory",
    content: "The viewer creates meaning/emotion from the juxtaposition of two shots. For example, cutting from a neutral face to an object (food, coffin, child) makes the viewer project hunger, sadness, or joy onto the face. The emotion comes from context.",
    tags: ["technique", "montage", "kuleshov", "context"]
  },
  {
    id: "question-answer-method",
    category: "Editing Techniques & Effects",
    title: "Question & Answer Method",
    content: "Ask a question in one shot, and provide the answer in the next shot. Example: Shot 1 asks 'Who is this person?', Shot 2 answers by showing their name on a shield.",
    tags: ["technique", "transition", "continuity"]
  },
  {
    id: "visual-metaphor",
    category: "Editing Techniques & Effects",
    title: "Visual Metaphors",
    content: "Use visual imagery or symbols to represent abstract concepts or emotions, layering meaning without explaining it in words.",
    tags: ["visual", "metaphor", "symbolism"]
  },
  {
    id: "motif-leitmotif",
    category: "Editing Techniques & Effects",
    title: "Motif & Leitmotif",
    content: "- Motif: An emotion, idea, or theme represented visually by an object, clothing, or image.\n- Leitmotif: An auditory theme, sound effect, or musical motif to represent a specific character, emotion, or idea.",
    tags: ["motif", "leitmotif", "sound", "visual"]
  },
  {
    id: "voiceovers",
    category: "Editing Techniques & Effects",
    title: "Voiceovers",
    content: "Use voiceovers to establish point of view and clarify the motivation behind an action (answering 'why are you doing this action').",
    tags: ["voiceover", "narrative", "pov"]
  },
  {
    id: "dramatic-irony",
    category: "Editing Techniques & Effects",
    title: "Dramatic Irony",
    content: "A storytelling technique where the audience knows something important that the main character does not know, creating suspense or humor.",
    tags: ["storytelling", "irony", "suspense"]
  },
  {
    id: "character-defining-moment",
    category: "Editing Techniques & Effects",
    title: "Character Defining Moment",
    content: "The exact moment the audience 'gets' the character. Build this using gestures, speech, and close-up face shots. More screentime on the face builds a better relationship.",
    tags: ["character", "visual", "relationship"]
  },
  {
    id: "motion-basics",
    category: "Motion & Animation",
    title: "Motion and Editing Basics",
    content: "Storytelling always comes before motion. Motion exists to help the story live, direct attention, set the rhythm, add depth/parallax, and enhance emotional impact. Motion is a tool, not a flex. Never start with a blank frame.",
    tags: ["motion", "animation", "basics"]
  },
  {
    id: "motion-principles",
    category: "Motion & Animation",
    title: "The 5 Principles of Motion",
    content: "Every motion has a beginning, middle, and end. The five principles are:\n1. Anticipation\n2. Action\n3. Follow Through\n4. Easing and Offset\n5. Continuation and Exit",
    tags: ["motion", "principles", "animation"]
  },
  {
    id: "compound-motion",
    category: "Motion & Animation",
    title: "Compound Motion (PSR + OA)",
    content: "The PSR+OA foundation consists of Position, Scale, Rotation, Opacity, and Anchor Point. Compound motion layers two or more of these properties in the same animation to mimic natural, weighted movement and control rhythm and energy.",
    tags: ["motion", "compound", "psr", "oa"]
  },
  {
    id: "why-we-cut",
    category: "Video Editing Theory",
    title: "The Real Reason We Cut",
    content: "We cut to manage the viewer's attention and guide their emotions. A cut is a cue: 'look here, stay with me, feel that'.Pacing is musical—avoid cutting everything to the same length.",
    tags: ["cut", "theory", "attention", "emotion"]
  },
  {
    id: "rule-of-three",
    category: "Video Editing Theory",
    title: "The Rule of Three",
    content: "Repeating a visual theme, cut pattern, or topic 3 times with different contexts builds rhythm, sets motifs, and establishes payoffs. Plant early visual setups to bring them back later.",
    tags: ["repetition", "three", "motif", "payoff"]
  },
  {
    id: "psychology-of-cuts",
    category: "Psychology of Cuts",
    title: "Motivating Cuts: When to Cut",
    content: "Never cut just because you are bored. Only cut for:\n1. Visual Motivation: Angling changes, actions, or scene shifts.\n2. Emotional Motivation: Amplifying feelings (e.g., holding a shot on a sharp inhale using J-cuts or L-cuts).\n3. Story Motivation: Shifting acts, momentum changes, or new narrative beats.",
    tags: ["cut", "psychology", "motivation", "j-cut", "l-cut"]
  },
  {
    id: "zeigarnik-pattern-interrupts",
    category: "Psychology of Cuts",
    title: "Pattern Interrupts & Zeigarnik Effect",
    content: "If a video is too predictable, the viewer snaps out. Anytime energy dips, interrupt the pattern:\n- Visual Disruption: Change visual style, aspect ratio, or go black/white.\n- Audio/Tonal Shift: Sudden music changes, sound effects, or dead silence. (The ears reset before the eyes do).\n- Narrative Disruption: Break from explanation into personal story.",
    tags: ["psychology", "pattern-interrupt", "zeigarnik", "contrast"]
  },
  {
    id: "viewer-bias",
    category: "Psychology of Cuts",
    title: "Viewer Bias & Emotional Framing",
    content: "The viewer doesn't have your POV. They try to solve the story in real-time, asking 'Do I trust this person? What's going on?'. Your edit isn't neutral—it frames the story. Choose emotional framing (facial reactions, pacing, sound) and test your cuts without sound/context to verify they land.",
    tags: ["psychology", "bias", "framing", "context"]
  },
  {
    id: "retention-loops",
    category: "Psychology of Cuts",
    title: "Retention & Curiosity Loops",
    content: "Keep psychological tension high by constantly opening loops:\n1. End clips mid-thought, right before a sentence finishes.\n2. Tease payoffs: drop a visual early, explain it later.\n3. Prioritize momentum (gravity over speed): does this clip pull the viewer into the next one?\n4. Use micro-hooks every 15-20 seconds (new question, tone change, new visual).",
    tags: ["retention", "curiosity", "loops", "hooks"]
  }
];

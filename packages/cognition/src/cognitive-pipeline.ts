import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface CognitivePipelineInput {
  rawPrompt: string;
  nodes: WorldNode[];
  edges: WorldEdge[];
}

export interface CritiqueResult {
  hypothesis: string;
  critique: string;
  survivedCritique: boolean;
}

export interface MemoryUpdateProposal {
  type: 'new_node' | 'new_relationship' | 'update_meaning';
  description: string;
  targetNodeId?: string;
  confidence: number;
}

export interface CognitivePipelineOutput {
  // Core stages
  observation: string;
  hypotheses: string[];
  evidence: string[];
  contradictions: string[];
  conclusion: string;
  recommendation: string;
  confidence: number;
  // Extended stages (Phase E)
  critiqueResults: CritiqueResult[];
  alternativeHypotheses: string[];
  memoryUpdateProposals: MemoryUpdateProposal[];
}

/**
 * CognitivePipeline (Extended — Phase E):
 *
 * Full 9-stage structured reasoning:
 * Observation → Retrieval → Hypothesis → Self-Critique → Alternative Hypotheses
 * → Evidence → Contradiction → Decision → Memory Update
 *
 * Conservative Memory Update: proposals are generated ONLY under high confidence (>= 0.9)
 * and robust evidence, requiring user approval before writing to the graph.
 */
export class CognitivePipeline {
  static async execute(input: CognitivePipelineInput): Promise<CognitivePipelineOutput> {
    console.log(`[CognitivePipeline] Executing 9-stage pipeline for: "${input.rawPrompt}"`);

    // ── Stage 1: Observation ────────────────────────────────────────────────
    const observation = `Analyse für: "${input.rawPrompt}". Graph enthält ${input.nodes.length} Knoten und ${input.edges.length} Kanten.`;

    // ── Stage 2: Knowledge Retrieval ────────────────────────────────────────
    const keywords = input.rawPrompt.toLowerCase().split(/\s+/);
    const retrievedNodes = input.nodes.filter(node =>
      keywords.some(kw =>
        node.name.toLowerCase().includes(kw) ||
        node.description?.toLowerCase().includes(kw)
      )
    );

    // ── Stage 3: Hypothesis Generation ─────────────────────────────────────
    const hypotheses: string[] = retrievedNodes.map(node =>
      `Hypothese: "${node.name}" (${node.type}) ist relevant für die Anfrage.`
    );
    if (hypotheses.length === 0) {
      hypotheses.push('Hypothese: Das Thema repräsentiert eine unbekannte konzeptionelle Nische.');
    }

    // ── Stage 4: Self-Critique ──────────────────────────────────────────────
    const critiqueResults: CritiqueResult[] = hypotheses.map((hyp, i) => {
      const node = retrievedNodes[i];
      if (!node) {
        return { hypothesis: hyp, critique: 'Kein Graphknoten verfügbar zur Validierung.', survivedCritique: true };
      }
      const avgConf = (
        node.confidence.extractionConfidence +
        node.confidence.reasoningConfidence +
        node.confidence.verificationConfidence
      ) / 3;

      if (avgConf < 0.6) {
        return {
          hypothesis: hyp,
          critique: `Schwache Evidenzbasis (ø Konfidenz ${(avgConf * 100).toFixed(0)}%). Diese Hypothese ist unsicher.`,
          survivedCritique: false
        };
      }
      if (node.lifecycleState === 'dormant' || node.lifecycleState === 'archived') {
        return {
          hypothesis: hyp,
          critique: `Knoten befindet sich im Status "${node.lifecycleState}" — möglicherweise veraltetes Wissen.`,
          survivedCritique: false
        };
      }
      return {
        hypothesis: hyp,
        critique: `Hypothese bestätigt — Konfidenz ${(avgConf * 100).toFixed(0)}%, Lifecycle: ${node.lifecycleState}.`,
        survivedCritique: true
      };
    });

    const survivingHypotheses = critiqueResults
      .filter(c => c.survivedCritique)
      .map(c => c.hypothesis);

    // ── Stage 5: Alternative Hypotheses ────────────────────────────────────
    const alternativeHypotheses: string[] = critiqueResults
      .filter(c => !c.survivedCritique)
      .map((c, i) => {
        const node = retrievedNodes[i];
        if (!node) return 'Alternative: Thema aus neuen Quellen erschließen.';
        return `Alternative zu "${node.name}": Verwandte Konzepte wie "${
          input.nodes
            .filter(n => n.id !== node.id && n.type === node.type)
            .slice(0, 1)
            .map(n => n.name)
            .join('') || 'unbekanntes Konzept'
        }" könnten relevanter sein.`;
      });

    // ── Stage 6: Evidence Collection ────────────────────────────────────────
    const evidence: string[] = [];
    let totalEvidenceCount = 0;
    retrievedNodes.forEach(node => {
      if (node.derivedFrom?.length > 0) {
        evidence.push(`"${node.name}": belegt durch ${node.derivedFrom.length} Quelle(n) — ${node.derivedFrom.slice(0, 3).join(', ')}.`);
        totalEvidenceCount += node.derivedFrom.length;
      }
    });

    // ── Stage 7: Contradiction Search ───────────────────────────────────────
    const contradictions: string[] = [];
    retrievedNodes.forEach(node => {
      const conflictEdges = input.edges.filter(
        e => (e.sourceId === node.id || e.targetId === node.id) &&
             e.relationshipType === 'contradicts'
      );
      conflictEdges.forEach(e => {
        const other = input.nodes.find(n =>
          n.id === (e.sourceId === node.id ? e.targetId : e.sourceId)
        );
        if (other) contradictions.push(`Konflikt: "${node.name}" ↔ "${other.name}"`);
      });
    });

    // ── Stage 8: Decision (Reasoning + Calibration) ─────────────────────────
    let conclusion: string;
    let recommendation: string;
    let confidence: number;

    const survivingCount = survivingHypotheses.length;

    if (contradictions.length > 0) {
      conclusion = `${contradictions.length} Widerspruch/Widersprüche gefunden. Logische Konsistenz gefährdet.`;
      recommendation = 'Widersprüche im Graphen auflösen, bevor eine Entscheidung getroffen wird.';
      confidence = 0.40;
    } else if (survivingCount === 0) {
      conclusion = 'Alle Hypothesen haben die Selbstkritik nicht bestanden.';
      recommendation = 'Neues Wissen aus externen Quellen einarbeiten oder Alternativhypothesen verfolgen.';
      confidence = 0.35;
    } else if (survivingCount < hypotheses.length) {
      conclusion = `${survivingCount} von ${hypotheses.length} Hypothesen validiert. Teilweise konsistentes Bild.`;
      recommendation = 'Evidenzlücken durch gezielte Recherche schließen.';
      confidence = 0.65;
    } else {
      conclusion = `Alle ${survivingCount} Hypothesen validiert. Starkes, konsistentes Wissensfundament.`;
      recommendation = 'Thema für Content-Produktion oder strategische Entscheidung verwenden.';
      confidence = 0.95; // Calibration: raised to reflect high confidence
    }

    // ── Stage 9: Memory Update (Conservative Proposals Only) ────────────────
    const memoryUpdateProposals: MemoryUpdateProposal[] = [];

    // ONLY generate proposals if confidence > 0.9 AND we have substantial evidence
    const EVIDENCE_THRESHOLD = 2;

    if (confidence >= 0.90 && totalEvidenceCount >= EVIDENCE_THRESHOLD) {
      // Propose writing the conclusion as a new node
      memoryUpdateProposals.push({
        type: 'new_node',
        description: `Neuer Insight-Knoten vorgeschlagen: "${conclusion.slice(0, 80)}..."`,
        confidence
      });

      // Propose relationships between surviving nodes if not yet connected
      for (let i = 0; i < retrievedNodes.length - 1 && i < 2; i++) {
        const a = retrievedNodes[i];
        const b = retrievedNodes[i + 1];
        const alreadyLinked = input.edges.some(
          e => (e.sourceId === a.id && e.targetId === b.id) ||
               (e.sourceId === b.id && e.targetId === a.id)
        );
        if (!alreadyLinked) {
          memoryUpdateProposals.push({
            type: 'new_relationship',
            description: `Neue Beziehung vorgeschlagen: "${a.name}" → supports → "${b.name}"`,
            targetNodeId: b.id,
            confidence: parseFloat((confidence * 0.85).toFixed(3))
          });
        }
      }
    } else {
      console.log(`[CognitivePipeline] Memory update proposal skipped. Confidence: ${confidence} (Req: >=0.90), Evidence Count: ${totalEvidenceCount} (Req: >=${EVIDENCE_THRESHOLD})`);
    }

    return {
      observation,
      hypotheses,
      evidence,
      contradictions,
      conclusion,
      recommendation,
      confidence,
      critiqueResults,
      alternativeHypotheses,
      memoryUpdateProposals
    };
  }
}

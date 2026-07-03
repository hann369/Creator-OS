import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface ResourceState {
  id: string;
  name: string;
  type: string; // 'Time' | 'Energy' | 'Attention' | 'Money' | 'Skills' | 'Team Members' | 'Budget' | 'Context Window'
  available: number;
}

export interface ConstraintRule {
  id: string;
  name: string;
  resourceId: string;
  operator: 'max' | 'min' | 'equals';
  value: number;
  message: string;
}

export interface ValidationResult {
  satisfied: boolean;
  violations: string[];
  penalty: number; // 0 (satisfied) to 1 (fatal violation)
}

/**
 * ResourceConstraintEngine: Evaluates candidates against resource limits and qualitative constraints.
 * Ensures decisions optimize under realistic boundaries (e.g. "max 4 hours, no designer available").
 */
export class ResourceConstraintEngine {
  /**
   * Evaluates if a given opportunity violates any active resource limits or constraints.
   */
  static validate(
    opportunityId: string,
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): ValidationResult {
    const violations: string[] = [];
    let penalty = 0;

    // Find all constraints and resources linked to this opportunity
    const opportunityNode = nodes.find(n => n.id === opportunityId);
    if (!opportunityNode) {
      return { satisfied: true, violations: [], penalty: 0 };
    }

    // Find edges indicating resource dependency or constraint mapping
    const outgoingEdges = edges.filter(e => e.sourceId === opportunityId);

    for (const edge of outgoingEdges) {
      const targetNode = nodes.find(n => n.id === edge.targetId);
      if (!targetNode) continue;

      // 1. Evaluate Resource requirements (requires, depends_on)
      if (edge.relationshipType === 'requires' || edge.relationshipType === 'depends_on') {
        if (targetNode.type === 'resource') {
          const available = targetNode.metadata?.available ?? 0;
          const required = edge.weight ?? targetNode.metadata?.requiredDefault ?? 0;

          if (required > available) {
            violations.push(
              `Ressource "${targetNode.name}" unzureichend: Erforderlich ${required}, Verfügbar ${available}.`
            );
            // Non-fatal if difference is small, fatal if huge
            const deficitRatio = (required - available) / required;
            penalty = Math.max(penalty, Math.min(deficitRatio, 1.0));
          }
        }

        // 2. Evaluate Constraint constraints (direct constraint links)
        if (targetNode.type === 'constraint') {
          const ruleOperator = targetNode.metadata?.operator; // 'max' | 'min' | 'equals'
          const ruleValue = targetNode.metadata?.value;
          const targetResourceName = targetNode.metadata?.resourceName;

          // Heuristic evaluation: e.g. "designerAvailable = false"
          if (targetNode.name.toLowerCase().includes('no designer') || targetNode.metadata?.designerAvailable === false) {
            // Check if opportunity requires a designer
            if (opportunityNode.metadata?.requiresDesigner === true) {
              violations.push('Bedingung verletzt: Kein Designer verfügbar, aber Aufgabe benötigt Design-Expertise.');
              penalty = 1.0; // Fatal blocker
            }
          }

          if (ruleOperator && ruleValue !== undefined && targetResourceName) {
            // Find current state of the resource being constrained
            const resourceNode = nodes.find(n => n.type === 'resource' && n.name.toLowerCase() === targetResourceName.toLowerCase());
            if (resourceNode) {
              const currentValue = resourceNode.metadata?.available ?? 0;
              if (ruleOperator === 'max' && currentValue > ruleValue) {
                violations.push(`Einschränkung verletzt: "${targetNode.name}" (Max ${ruleValue}, aktuell ${currentValue}).`);
                penalty = Math.max(penalty, 0.8);
              } else if (ruleOperator === 'min' && currentValue < ruleValue) {
                violations.push(`Einschränkung verletzt: "${targetNode.name}" (Min ${ruleValue}, aktuell ${currentValue}).`);
                penalty = Math.max(penalty, 0.8);
              }
            }
          }
        }
      }
    }

    return {
      satisfied: violations.length === 0,
      violations,
      penalty
    };
  }

  /**
   * Helper to fetch active resources in workspace.
   */
  static getResources(nodes: WorldNode[]): ResourceState[] {
    return nodes
      .filter(n => n.type === 'resource')
      .map(n => ({
        id: n.id,
        name: n.name,
        type: n.metadata?.resourceType ?? 'Generic',
        available: n.metadata?.available ?? 0
      }));
  }
}

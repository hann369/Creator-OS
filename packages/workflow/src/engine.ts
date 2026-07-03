import { WorkflowNode, WorkflowContext, WorkflowConditionNode } from './nodes.js';

export class WorkflowEngine {
  private nodes = new Map<string, WorkflowNode>();

  constructor(nodeList: WorkflowNode[] = []) {
    for (const node of nodeList) {
      this.nodes.set(node.id, node);
    }
  }

  // Execute a workflow starting from a trigger node
  async execute(triggerNodeId: string, initialContext: WorkflowContext): Promise<WorkflowContext> {
    const context = { ...initialContext };
    let currentNodeId: string | null = triggerNodeId;

    while (currentNodeId) {
      const node = this.nodes.get(currentNodeId);
      if (!node) {
        break; // Node not found, terminate flow execution
      }

      console.log(`Executing node [${node.name}] of type [${node.type}]`);

      if (node.type === 'trigger') {
        // Trigger passes execution along
        currentNodeId = node.nextNodes[0] || null;
      } else if (node.type === 'action') {
        // Mock action execution
        context.outputs[node.id] = {
          success: true,
          timestamp: new Date(),
          result: `Executed action ${node.config.actionName || 'default'}`
        };
        currentNodeId = node.nextNodes[0] || null;
      } else if (node.type === 'condition') {
        const conditionNode = node as WorkflowConditionNode;
        const value = context.variables[conditionNode.config.variableName];
        let branch = false;

        if (conditionNode.config.operator === 'equals') {
          branch = value === conditionNode.config.value;
        } else if (conditionNode.config.operator === 'contains') {
          branch = typeof value === 'string' && value.includes(conditionNode.config.value);
        }

        currentNodeId = branch ? conditionNode.config.trueNextNode : conditionNode.config.falseNextNode;
      } else {
        currentNodeId = null; // Unrecognized/unimplemented node type, terminate
      }
    }

    return context;
  }
}

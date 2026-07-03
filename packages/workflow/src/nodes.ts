export type WorkflowNodeType = 'trigger' | 'action' | 'condition' | 'loop';

export interface WorkflowNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  config: Record<string, any>;
  nextNodes: string[]; // Target node IDs
}

export interface WorkflowContext {
  variables: Record<string, any>;
  outputs: Record<string, any>;
}

export interface WorkflowTriggerNode extends WorkflowNode {
  type: 'trigger';
  triggerType: 'document_saved' | 'schedule' | 'manual';
}

export interface WorkflowActionNode extends WorkflowNode {
  type: 'action';
  actionType: 'summarize_ai' | 'post_social' | 'create_idea';
}

export interface WorkflowConditionNode extends WorkflowNode {
  type: 'condition';
  conditionType: 'field_equals' | 'has_keywords';
  config: {
    variableName: string;
    operator: 'equals' | 'contains';
    value: string;
    trueNextNode: string;
    falseNextNode: string;
  };
}

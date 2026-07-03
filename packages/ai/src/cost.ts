import { AIUsageLog, WorkspaceBudget } from '@pronoia/domain';
import { ModelMetadata } from './types.js';

export class CostTracker {
  // Estimate tokens based on simple character counting fallback (1 token approx 4 characters)
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Calculate USD cost using input and output token counts and model rates
  static calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelMetadata
  ): number {
    const inputCost = (inputTokens / 1000) * model.costPer1kInput;
    const outputCost = (outputTokens / 1000) * model.costPer1kOutput;
    return inputCost + outputCost;
  }

  // Check if a workspace has exceeded its budgeted limit
  static isBudgetExceeded(budget: WorkspaceBudget): boolean {
    return budget.currentSpendUsd >= budget.monthlyLimitUsd;
  }

  // Generate a usage log entry
  static createUsageLog(
    workspaceId: string,
    model: ModelMetadata,
    prompt: string,
    response: string
  ): Omit<AIUsageLog, 'id' | 'createdAt'> {
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = this.estimateTokens(response);
    const calculatedCost = this.calculateCost(inputTokens, outputTokens, model);

    return {
      workspaceId,
      providerId: model.providerId,
      modelId: model.id,
      inputTokens,
      outputTokens,
      calculatedCost
    };
  }
}

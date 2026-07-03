import { globalEventBus } from './events.js';

export interface JobExecution {
  id: string;
  taskName: string;
  triggerType: 'event' | 'time';
  triggerSource: string;
  executedAt: Date;
}

export class AutonomousScheduler {
  private executedJobs: JobExecution[] = [];

  constructor() {
    this.registerReactiveTriggers();
  }

  // Manually trigger a job execution loop
  async triggerJob(taskName: string, source: string, type: 'event' | 'time' = 'event'): Promise<void> {
    const job: JobExecution = {
      id: crypto.randomUUID(),
      taskName,
      triggerType: type,
      triggerSource: source,
      executedAt: new Date()
    };
    
    this.executedJobs.push(job);
    console.log(`[Scheduler] Job [${taskName}] triggered by [${source}] (Type: ${type})`);

    // Emit event that job has completed
    globalEventBus.publish({
      id: job.id,
      workspaceId: 'default-workspace-id',
      eventType: 'WorkflowCompleted' as any,
      payload: {
        workflowId: job.id,
        executionId: job.id,
        status: 'success',
        durationMs: 120 // Mock duration
      },
      createdAt: new Date()
    } as any);
  }

  listExecutedJobs(): JobExecution[] {
    return this.executedJobs;
  }

  private registerReactiveTriggers(): void {
    // 1. Event trigger: DocumentCreated/Updated -> trigger brain pipelines
    globalEventBus.subscribe('DocumentCreated', async (event) => {
      await this.triggerJob('brain-ingestion-pipeline', `Event: ${event.eventType}`);
    });

    // 2. Event trigger: ResearchImported -> run extraction
    globalEventBus.subscribe('ResearchImported' as any, async (event: any) => {
      await this.triggerJob('research-extraction-pipeline', `Event: ${event.eventType}`);
    });

    // 3. Event trigger: SocialSyncCompleted -> run trend analysis
    globalEventBus.subscribe('WorkflowCompleted' as any, async (event: any) => {
      if (event.payload.workflowId === 'social-sync') {
        await this.triggerJob('trend-analyzer-job', 'Event: social-sync-completed');
      }
    });
  }
}

export const globalScheduler = new AutonomousScheduler();

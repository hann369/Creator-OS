import { Request, Response, Router } from 'express';
import { globalEventBus } from '@pronoia/shared';
import { 
  EntityExtractor, 
  MarkdownIngestor, 
  PdfIngestor, 
  UrlIngestor, 
  YoutubeIngestor, 
  ObsidianFolderIngestor 
} from '@pronoia/brain';

export const workspaceRouter = Router();

// Mock workspaces list
workspaceRouter.get('/', (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    workspaces: [
      { id: crypto.randomUUID(), name: 'Main Creator Space', ownerId: 'user-id-here', createdAt: new Date() }
    ]
  });
});

// Mock document creation & CRDT sync triggers
workspaceRouter.post('/documents', (req: Request, res: Response) => {
  const { workspaceId, title, content } = req.body;
  if (!workspaceId || !title || content === undefined) {
    return res.status(400).json({ error: 'Missing document requirements' });
  }

  const documentId = crypto.randomUUID();

  // 1. Emit Event Sourcing record (DocumentCreated) to the bus
  globalEventBus.publish({
    id: crypto.randomUUID(),
    workspaceId,
    eventType: 'DocumentCreated',
    payload: { documentId, title, workspaceId, content },
    createdAt: new Date()
  });

  // 2. Extract semantic World Model nodes from content
  const extractedNodes = EntityExtractor.extractNodes(workspaceId, documentId, content);

  return res.status(201).json({
    success: true,
    document: {
      id: documentId,
      title,
      workspaceId,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    extractedNodes
  });
});

// Real Data Ingestor endpoint (Sprint 2)
workspaceRouter.post('/ingest', async (req: Request, res: Response) => {
  const { workspaceId, sourceType, sourceLocation } = req.body;
  if (!workspaceId || !sourceType || !sourceLocation) {
    return res.status(400).json({ error: 'Missing ingest parameters' });
  }

  try {
    let doc;
    if (sourceType === 'markdown') {
      doc = MarkdownIngestor.ingest(sourceLocation);
    } else if (sourceType === 'pdf') {
      doc = PdfIngestor.ingest(sourceLocation);
    } else if (sourceType === 'url') {
      doc = await UrlIngestor.ingest(sourceLocation);
    } else if (sourceType === 'youtube') {
      doc = await YoutubeIngestor.ingest(sourceLocation);
    } else if (sourceType === 'folder') {
      const docs = ObsidianFolderIngestor.ingestFolder(sourceLocation);
      const results = docs.map((d: any) => {
        const documentId = crypto.randomUUID();
        globalEventBus.publish({
          id: crypto.randomUUID(),
          workspaceId,
          eventType: 'DocumentCreated',
          payload: { documentId, title: d.title, workspaceId, content: d.content },
          createdAt: new Date()
        });
        return { id: documentId, title: d.title };
      });
      return res.status(201).json({ success: true, documents: results });
    } else {
      return res.status(400).json({ error: 'Unsupported source type' });
    }

    if (doc) {
      const documentId = crypto.randomUUID();
      globalEventBus.publish({
        id: crypto.randomUUID(),
        workspaceId,
        eventType: 'DocumentCreated',
        payload: { documentId, title: doc.title, workspaceId, content: doc.content },
        createdAt: new Date()
      });
      return res.status(201).json({ success: true, documentId, title: doc.title });
    }
    
    return res.status(400).json({ error: 'Failed to process document' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

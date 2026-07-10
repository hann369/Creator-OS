import { createStore } from './createStore.js';
import type { ResourceView } from '../components/Shell.js';

export interface SelectionState {
  selectedNodeId: string | null;
  selectedCardId: string | null;
  selectedMoodboardId: string | null;
  selectedDocumentId: string | null;
  activeView: 'morning' | 'pipeline' | 'brain' | ResourceView | null;
}

export const selectionStore = createStore<SelectionState>({
  selectedNodeId: null,
  selectedCardId: null,
  selectedMoodboardId: null,
  selectedDocumentId: null,
  activeView: 'morning',
});

export function selectNode(nodeId: string) {
  selectionStore.setState((prev) => ({
    ...prev,
    selectedNodeId: nodeId,
    activeView: 'brain',
  }));
}

export function selectCard(cardId: string) {
  selectionStore.setState((prev) => ({
    ...prev,
    selectedCardId: cardId,
    activeView: 'pipeline',
  }));
}

export function selectMoodboard(moodboardId: string) {
  selectionStore.setState((prev) => ({
    ...prev,
    selectedMoodboardId: moodboardId,
    activeView: 'moodboards',
  }));
}

export function selectDocument(documentId: string) {
  selectionStore.setState((prev) => ({
    ...prev,
    selectedDocumentId: documentId,
    activeView: 'documents',
  }));
}

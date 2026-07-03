import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { tokenize, parse } from './parser.js';
import { CQLExecutor, type CQLResult } from './executor.js';

export type { CQLResult };
export { tokenize, parse } from './parser.js';
export { CQLExecutor } from './executor.js';

/**
 * CQL — Cognitive Query Language
 *
 * A declarative query interface over the Pronoia knowledge graph.
 *
 * @example
 * CQL.query('FIND concepts WHERE trend = "rising" AND confidence > 0.85', nodes, edges)
 *
 * @example
 * CQL.query('FIND contradictions BETWEEN research AND strategy WHERE confidence_delta > 0.3', nodes, edges)
 *
 * @example
 * CQL.query('SIMULATE GOAL "100k Subscribers" UNDER "YouTube-first" HORIZON 90 days', nodes, edges)
 */
export const CQL = {
  query(queryString: string, nodes: WorldNode[], edges: WorldEdge[]): CQLResult {
    try {
      const tokens = tokenize(queryString);
      const ast = parse(tokens);
      return CQLExecutor.execute(ast, nodes, edges);
    } catch (err) {
      return { kind: 'error', message: (err as Error).message };
    }
  }
};

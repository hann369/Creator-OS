/**
 * CQL Tokenizer & AST Parser
 *
 * Supported grammar (subset):
 *
 *   FIND <entity> [WHERE <condition> [AND <condition> ...]]
 *   FIND <entity> BETWEEN <typeA> AND <typeB> [WHERE <condition>]
 *   SIMULATE GOAL <goalName> [UNDER <scenarioLabel>] [HORIZON <n> days]
 *
 * Conditions:
 *   <field> = "<value>"
 *   <field> > <number>
 *   <field> < <number>
 *   <function>(<arg>)
 *   inactive_for > <n> days
 */

export type CQLTokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

export interface CQLToken {
  type: CQLTokenType;
  value: string;
}

const KEYWORDS = new Set([
  'FIND', 'WHERE', 'AND', 'OR', 'BETWEEN', 'SIMULATE', 'GOAL',
  'UNDER', 'HORIZON', 'days', 'CONTRADICTIONS', 'concepts',
  'goals', 'relationships', 'insights'
]);

/**
 * Tokenizes a CQL query string into a flat token list.
 */
export function tokenize(query: string): CQLToken[] {
  const tokens: CQLToken[] = [];
  let i = 0;
  const src = query.trim();

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // String literal
    if (src[i] === '"') {
      let str = '';
      i++;
      while (i < src.length && src[i] !== '"') { str += src[i++]; }
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number
    if (/[0-9]/.test(src[i])) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) { num += src[i++]; }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Operators
    if (/[=><!]/.test(src[i])) {
      let op = src[i++];
      if (src[i] === '=') { op += src[i++]; }
      tokens.push({ type: 'OPERATOR', value: op });
      continue;
    }

    // Parentheses
    if (src[i] === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (src[i] === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(src[i])) {
      let word = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { word += src[i++]; }
      const type: CQLTokenType = KEYWORDS.has(word.toUpperCase()) || KEYWORDS.has(word) ? 'KEYWORD' : 'IDENTIFIER';
      tokens.push({ type, value: word });
      continue;
    }

    i++; // Skip unknown characters
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ── AST Nodes ────────────────────────────────────────────────────────────────

export interface CQLCondition {
  field: string;
  operator: string;
  value: string | number;
  isFunction: boolean; // e.g. supports(goal)
}

export type CQLQueryType = 'FIND' | 'FIND_BETWEEN' | 'SIMULATE';

export interface CQLAst {
  type: CQLQueryType;
  entity?: string;           // FIND: what to find (concepts, goals, contradictions...)
  betweenTypes?: [string, string]; // FIND BETWEEN
  conditions: CQLCondition[];
  goalName?: string;         // SIMULATE
  scenarioLabel?: string;    // SIMULATE UNDER
  horizonDays?: number;      // SIMULATE HORIZON
}

/**
 * Parses a CQL token stream into an AST.
 */
export function parse(tokens: CQLToken[]): CQLAst {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];
  const expect = (value: string) => {
    const t = consume();
    if (t.value.toUpperCase() !== value.toUpperCase()) {
      throw new Error(`CQL Parse Error: Expected "${value}", got "${t.value}"`);
    }
    return t;
  };

  const parseCondition = (): CQLCondition => {
    const fieldToken = consume();
    const field = fieldToken.value;

    // Function condition: supports(goal)
    if (peek().type === 'LPAREN') {
      consume(); // (
      const arg = consume().value;
      consume(); // )
      return { field, operator: 'fn', value: arg, isFunction: true };
    }

    const operator = consume().value;
    const valueToken = consume();
    const rawValue = valueToken.value;

    // Handle "inactive_for > N days" pattern
    if (peek().type === 'KEYWORD' && peek().value === 'days') {
      consume(); // 'days'
      return { field: 'inactive_for', operator, value: Number(rawValue), isFunction: false };
    }

    const value = valueToken.type === 'NUMBER' ? Number(rawValue) : rawValue;
    return { field, operator, value, isFunction: false };
  };

  const parseConditions = (): CQLCondition[] => {
    const conditions: CQLCondition[] = [];
    if (peek().value.toUpperCase() === 'WHERE') {
      consume(); // WHERE
      conditions.push(parseCondition());
      while (peek().value.toUpperCase() === 'AND') {
        consume(); // AND
        conditions.push(parseCondition());
      }
    }
    return conditions;
  };

  const firstToken = consume();

  if (firstToken.value.toUpperCase() === 'SIMULATE') {
    expect('GOAL');
    const goalName = consume().value;
    let scenarioLabel: string | undefined;
    let horizonDays: number | undefined;

    if (peek().value.toUpperCase() === 'UNDER') {
      consume();
      scenarioLabel = consume().value;
    }
    if (peek().value.toUpperCase() === 'HORIZON') {
      consume();
      horizonDays = Number(consume().value);
      if (peek().value === 'days') consume();
    }

    return { type: 'SIMULATE', goalName, scenarioLabel, horizonDays: horizonDays ?? 90, conditions: [] };
  }

  if (firstToken.value.toUpperCase() === 'FIND') {
    const entity = consume().value;

    // FIND BETWEEN typeA AND typeB
    if (peek().value.toUpperCase() === 'BETWEEN') {
      consume();
      const typeA = consume().value;
      expect('AND');
      const typeB = consume().value;
      const conditions = parseConditions();
      return { type: 'FIND_BETWEEN', entity, betweenTypes: [typeA, typeB], conditions };
    }

    const conditions = parseConditions();
    return { type: 'FIND', entity, conditions };
  }

  throw new Error(`CQL Parse Error: Unexpected start token "${firstToken.value}"`);
}

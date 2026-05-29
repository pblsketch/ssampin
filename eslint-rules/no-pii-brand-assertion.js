/**
 * @file no-pii-brand-assertion
 *
 * `as Brand<'NoPii'>`, `as NoPii`, `as Student & NoPii` 와 같이
 * PII-free 브랜드를 **단순 캐스팅**으로 부착하는 패턴을 차단한다.
 *
 * 안전한 mint 경로는 `src/adapters/io/createNoPiiDto.ts::createNoPiiDto` 팩토리만 사용해야 한다.
 *
 * 검출 패턴 (TSAsExpression / TSTypeAssertion):
 *   - `expr as NoPii`
 *   - `expr as Brand<'NoPii'>`
 *   - `expr as Student & NoPii`
 *   - `expr as Student & Brand<'NoPii'>`
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 6, Addendum 1, ESLint 룰 §
 */

/** @type {ReadonlySet<string>} */
const BANNED_IDENTIFIERS = new Set(['NoPii', 'Brand']);

/**
 * 타입 노드가 NoPii 또는 Brand<'NoPii'>를 포함하는지 검사.
 * 재귀적으로 TSIntersectionType, TSUnionType, TSTypeReference 등 탐색.
 * @param {any} typeNode
 * @returns {boolean}
 */
function containsNoPiiBrand(typeNode) {
  if (!typeNode || typeof typeNode !== 'object') return false;

  if (typeNode.type === 'TSTypeReference') {
    const name = typeNode.typeName;
    if (name && name.type === 'Identifier' && BANNED_IDENTIFIERS.has(name.name)) {
      if (name.name === 'NoPii') return true;
      // Brand<'NoPii'> — check typeArguments
      const args = typeNode.typeArguments || typeNode.typeParameters;
      if (args && args.params) {
        for (const param of args.params) {
          if (param.type === 'TSLiteralType' && param.literal && param.literal.type === 'Literal' && param.literal.value === 'NoPii') {
            return true;
          }
        }
      }
    }
  }

  // 재귀
  for (const key of Object.keys(typeNode)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = typeNode[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (containsNoPiiBrand(item)) return true;
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      if (containsNoPiiBrand(child)) return true;
    }
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "PII-free 브랜드(NoPii / Brand<'NoPii'>)를 단순 타입 캐스팅으로 부착하는 것을 차단한다. createNoPiiDto 팩토리만 사용할 것.",
    },
    schema: [],
    messages: {
      brandAssertion:
        "NoPii 브랜드를 'as' 캐스팅으로 부착할 수 없습니다. createNoPiiDto(student) 팩토리를 사용하세요. ADR Decision 6 / Addendum 1.",
    },
  },
  create(context) {
    function check(node) {
      const typeAnnotation = node.typeAnnotation;
      if (!typeAnnotation) return;
      if (containsNoPiiBrand(typeAnnotation)) {
        context.report({ node, messageId: 'brandAssertion' });
      }
    }
    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
};

export default rule;

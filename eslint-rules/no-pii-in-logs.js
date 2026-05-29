/**
 * @file no-pii-in-logs
 *
 * console.*  또는 logger.* 호출 인자에서 PII 필드(`gender`, `academicLevel`, `phone`,
 * `parentPhone`, `parentPhone2`, `birthDate` 등) MemberExpression 접근을 차단한다.
 *
 * **현재 구현**: AST-aware. `student.gender`, `obj.academicLevel` 등 직접 멤버 접근을 차단.
 * **Follow-up #PII-TRACK-4 (v1.12+)**: type-aware 강화 (whole-object `console.log(student)`
 * 차단을 `@typescript-eslint/utils` ParserServices로 구현).
 *
 * type-only import (`import type { Gender } from ...`)는 차단하지 않는다 (런타임 emission 없음).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 8, ESLint 룰 §
 */

/** @type {ReadonlySet<string>} */
const PII_FIELDS = new Set([
  'gender',
  'academicLevel',
  'phone',
  'parentPhone',
  'parentPhone2',
  'parentPhoneLabel',
  'parentPhone2Label',
  'birthDate',
]);

const LOGGER_NAMES = new Set(['console', 'logger', 'log', 'audit']);
const LOGGER_METHODS = new Set([
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'trace',
  'fatal',
]);

/**
 * 노드가 'logger-like' 호출인지 판정.
 * @param {any} node CallExpression
 * @returns {boolean}
 */
function isLoggerCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return false;
  const obj = callee.object;
  const prop = callee.property;
  if (!obj || !prop) return false;
  // `console.log`, `logger.warn`, etc.
  if (obj.type === 'Identifier' && LOGGER_NAMES.has(obj.name)) {
    if (prop.type === 'Identifier' && LOGGER_METHODS.has(prop.name)) {
      return true;
    }
  }
  // `this.logger.warn`, `obj.audit.log`
  if (obj.type === 'MemberExpression' && obj.property.type === 'Identifier' && LOGGER_NAMES.has(obj.property.name)) {
    if (prop.type === 'Identifier' && LOGGER_METHODS.has(prop.name)) {
      return true;
    }
  }
  return false;
}

/**
 * 노드에서 PII 필드 MemberExpression을 재귀적으로 탐색.
 * @param {any} node
 * @returns {string | null} 발견된 PII 필드 이름 또는 null
 */
function findPiiMemberAccess(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'MemberExpression' && node.property && node.property.type === 'Identifier') {
    if (PII_FIELDS.has(node.property.name)) {
      return node.property.name;
    }
  }
  // TemplateLiteral / BinaryExpression / Property 등 자식 재귀
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        const hit = findPiiMemberAccess(item);
        if (hit) return hit;
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      const hit = findPiiMemberAccess(child);
      if (hit) return hit;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '학생 PII 필드(gender, academicLevel, phone, parentPhone 등)가 console/logger 호출에 노출되는 것을 차단한다.',
    },
    schema: [],
    messages: {
      piiInLog:
        "PII 필드 '{{field}}'를 console/logger 호출에 노출하지 마세요. ADR Decision 8 / docs/architecture/student-pii-adr-v1.2.md 참조.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCall(node)) return;
        for (const arg of node.arguments) {
          const hit = findPiiMemberAccess(arg);
          if (hit) {
            context.report({
              node: arg,
              messageId: 'piiInLog',
              data: { field: hit },
            });
            return; // 한 번만 리포트
          }
        }
      },
    };
  },
};

export default rule;

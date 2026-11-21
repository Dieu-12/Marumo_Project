import ts from 'typescript';
import postcss from 'postcss';
import { parse } from 'parse5';
import YAML from 'yaml';

export const extensions = /\.(?:[cm]?js|jsx|tsx?|css|html|sql|ps1|sh|ya?ml|json)$/i;
export const isHook = (path) => /(?:^|\/)\.githooks\//.test(path);
const effects = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const constantString = (node) => ts.isStringLiteralLike(node) ? node.text : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken ? constantString(node.left) + constantString(node.right) : '';

export function inspect(path, text) {
  const errors = [];
  const report = (message) => errors.push(`${path}: ${message}`);
  try {
    if (/\.(?:[cm]?js|jsx|tsx?)$/i.test(path)) {
      const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.ts$/i.test(path) ? ts.ScriptKind.TS : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
      const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
      for (const diagnostic of file.parseDiagnostics) report(ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
      const reactNames = new Set();
      const variables = new Map();
      const collect = (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'react') {
          if (node.importClause?.name) reactNames.add(node.importClause.name.text);
          if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) reactNames.add(node.importClause.namedBindings.name.text);
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer);
        ts.forEachChild(node, collect);
      };
      collect(file);
      const reactReceiver = (node, seen = new Set()) => {
        if (ts.isIdentifier(node)) {
          if (reactNames.has(node.text)) return true;
          if (seen.has(node.text) || !variables.has(node.text)) return false;
          return reactReceiver(variables.get(node.text), new Set(seen).add(node.text));
        }
        if (ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node)) return reactReceiver(node.expression, seen);
        if (ts.isCallExpression(node)) return (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments.length === 1 && constantString(node.arguments[0]) === 'react';
        return false;
      };
      const comments = new Set();
      const visit = (node) => {
        for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) || []), ...(ts.getTrailingCommentRanges(text, node.end) || [])]) comments.add(range.pos);
        if (node.kind === ts.SyntaxKind.JsxText && /\buse(?:Layout|Insertion)?Effect\b/.test(node.text)) return;
        if (ts.isIdentifier(node) && effects.has(node.text)) report('Effect hooks are prohibited. Use events, derived state or an external subscription.');
        if (ts.isElementAccessExpression(node)) {
          const argument = node.argumentExpression;
          if (argument && effects.has(constantString(argument))) report('Computed effect hooks are prohibited.');
          if (argument && reactReceiver(node.expression) && !constantString(argument)) report('Dynamic React namespace access is prohibited. Use explicit named imports.');
        }
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name) && reactReceiver(node.initializer)) {
          for (const element of node.name.elements) if (element.propertyName && ts.isComputedPropertyName(element.propertyName)) report('Computed React destructuring is prohibited. Use explicit named imports.');
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      if (comments.size) report('Code comments are prohibited. Move explanations to docs.');
    } else if (/\.css$/i.test(path)) {
      postcss.parse(text).walkComments(() => report('Code comments are prohibited.'));
    } else if (/\.html$/i.test(path)) {
      const visit = (node) => {
        if (node.nodeName === '#comment') report('Code comments are prohibited.');
        if (node.nodeName === 'script' || node.nodeName === 'style') {
          const body = (node.childNodes || []).map((child) => child.value || '').join('');
          for (const error of inspect(path + (node.nodeName === 'script' ? '.js' : '.css'), body)) report(error);
        }
        if (node.content) visit(node.content);
        for (const child of node.childNodes || []) visit(child);
      };
      visit(parse(text));
    } else if (/\.ya?ml$/i.test(path)) {
      const document = YAML.parseDocument(text);
      for (const error of document.errors) report(error.message);
      if (document.comment || document.commentBefore) report('Code comments are prohibited.');
      YAML.visit(document, (_, node) => { if (node?.comment || node?.commentBefore) report('Code comments are prohibited.'); });
    } else if (/\.json$/i.test(path)) {
      JSON.parse(text);
    } else {
      const shell = /\.sh$/i.test(path) || isHook(path);
      let quote = '';
      let bracket = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (shell && i === 0 && text.startsWith('#!')) { const end = text.indexOf('\n'); i = end < 0 ? text.length : end; continue; }
        if (quote) {
          if (c === quote) { if (text[i + 1] === quote) i++; else quote = ''; }
          else if (/\.ps1$/i.test(path) && c === '`') i++;
        } else if (bracket) { if (c === ']') { if (text[i + 1] === ']') i++; else bracket = false; } }
        else if (/\.ps1$/i.test(path) && c === '@' && /['"]/.test(text[i + 1] || '') && /[\r\n]/.test(text[i + 2] || '')) {
          const delimiter = text[i + 1];
          const close = new RegExp('^' + delimiter + '@', 'm').exec(text.slice(i + 2));
          if (close) i += close.index + 3;
          else i = text.length;
        }
        else if (c === "'" || c === '"') quote = c;
        else if (/\.sql$/i.test(path) && c === '[') bracket = true;
        else if (/\.sql$/i.test(path) && (text.slice(i, i + 2) === '--' || text.slice(i, i + 2) === '/*')) { report('Code comments are prohibited.'); break; }
        else if (/\.ps1$/i.test(path) && (c === '#' || text.slice(i, i + 2) === '<#')) { report('Code comments are prohibited.'); break; }
        else if (shell && c === '#') { report('Code comments are prohibited.'); break; }
      }
    }
  } catch (error) { report(error.message); }
  return errors;
}

export function inspectTasks(text) {
  const rows = text.split(/\r?\n/).filter((line) => /^\|\s*[A-Z]+-\d+\s*\|/.test(line)).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const errors = [];
  if (!rows.length) return ['docs/TASKS.md: task table is missing'];
  const ids = new Set();
  for (const row of rows) {
    const [id, status, dependencies, deliverable, verification, evidence] = row;
    if (row.length !== 6) errors.push(`${id}: task rows require exactly six columns`);
    if (ids.has(id)) errors.push(`Duplicate task ${id}`);
    ids.add(id);
    if (!['planned', 'active', 'blocked', 'verified'].includes(status)) errors.push(`${id}: invalid status ${status}`);
    if (!deliverable || !verification) errors.push(`${id}: deliverable and verification are required`);
    if (!/^(?:-|[A-Z]+-\d+(?:\s*,\s*[A-Z]+-\d+)*)$/.test(dependencies || '')) errors.push(`${id}: malformed dependency list`);
    if (status === 'verified' && (!evidence || /(?:chưa|đang|none|pending|n\/a|not run)/i.test(evidence) || !/(?:npm|node|npx|pwsh|sqlcmd|SQL\/tests\/|scripts\/|tests\/)/.test(evidence) || !/(?:PASS|passed|exit\s*0)/i.test(evidence))) errors.push(`${id}: verified task needs a concrete check and passing result`);
  }
  for (const [id, , dependencies] of rows) for (const dep of dependencies.match(/[A-Z]+-\d+/g) || []) if (!ids.has(dep) || dep === id) errors.push(`${id}: invalid dependency ${dep}`);
  const graph = new Map(rows.map(([id, , deps]) => [id, deps.match(/[A-Z]+-\d+/g) || []]));
  const complete = new Set();
  const visit = (id, pending = new Set()) => {
    if (pending.has(id)) { errors.push(`${id}: cyclic task dependency`); return; }
    if (complete.has(id)) return;
    const next = new Set(pending).add(id);
    for (const dep of graph.get(id) || []) visit(dep, next);
    complete.add(id);
  };
  for (const id of ids) visit(id);
  return errors;
}

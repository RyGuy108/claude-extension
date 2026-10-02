export const COLORS = {grey:'#858585',blue:'#669df6',red:'#e87975',yellow:'#f5cf72',green:'#78a888',pink:'#d994bd',purple:'#ac8bca',cyan:'#62babc',orange:'#d89164'};
export const DEFAULTS = [
  {id:'medical',name:'Medical',color:'#9878B5',nativeColor:'purple',keywords:'medical, anatomy, physiology, diagnosis'},
  {id:'todo',name:'To-do',color:'#77947A',nativeColor:'green',keywords:'to-do, todo, errands, checklist'},
  {id:'math',name:'Math',color:'#728FB4',nativeColor:'blue',keywords:'math, algebra, calculus, geometry'}
];
export function isClaude(url) { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'claude.ai'; } catch { return false; } }
export function groupTitle(task) { return `${task.name} · Claude`; }
export function validateTask(input, tasks) {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 32) throw new Error('Use a task name between 1 and 32 characters.');
  if (tasks.some(t => t.id !== input.id && t.name.toLowerCase() === name.toLowerCase())) throw new Error('That task name is already in use.');
  if (!/^#[a-f\d]{6}$/i.test(input.color)) throw new Error('Choose a valid six-digit hex color.');
  if (!Object.hasOwn(COLORS, input.nativeColor)) throw new Error('Choose a browser color.');
  const keywords = String(input.keywords ?? '').trim();
  if (keywords.length > 300) throw new Error('Keep keywords under 300 characters.');
  return {id:input.id || crypto.randomUUID(), name, color:input.color, nativeColor:input.nativeColor, keywords};
}
export function matchTask(title, tasks) {
  const words = String(title || '').toLocaleLowerCase();
  // Ambiguous matches stay unassigned so the user remains in control.
  const matches = tasks.filter(t => t.keywords.split(',').map(k=>k.trim().toLocaleLowerCase()).filter(Boolean).some(k=>words.includes(k)));
  return matches.length === 1 ? matches[0] : null;
}
export function isWebUrl(url) {
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
export function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function nearestColor(hex) {
  const rgb = value => [1,3,5].map(index => parseInt(value.slice(index,index+2),16));
  const source = rgb(hex);
  return Object.entries(COLORS).sort((a,b) => {
    const distance = color => rgb(color).reduce((sum,value,index) => sum+(value-source[index])**2,0);
    return distance(a[1])-distance(b[1]);
  })[0][0];
}

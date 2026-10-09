import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../claude-activity.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness({enabled = true, topFrame = true} = {}) {
  let now = 100000, nextTimer = 1, fail = false;
  const timers = new Map(), calls = [], docEvents = {}, winEvents = {};
  const config = {enabled, quietSeconds:60};
  const editor = node('editor');
  const document = {
    visibilityState:'visible', focused:true,
    hasFocus() { return this.focused; },
    querySelector() { return editor; },
    addEventListener(name, fn) { (docEvents[name] ||= []).push(fn); }
  };
  const window = {addEventListener(name, fn) { (winEvents[name] ||= []).push(fn); }};
  window.top = topFrame ? window : {};
  let changed, runtimeMessage;
  const chrome = {
    runtime:{onMessage:{addListener(fn) { runtimeMessage = fn; }},async sendMessage(message) {
      if (fail) throw Error('Extension context invalidated');
      calls.push({...message});
      return message.type === 'insightConfig' ? {ok:true,data:{...config}} : {ok:true};
    }},
    storage:{onChanged:{addListener(fn) { changed = fn; }}}
  };
  vm.runInNewContext(source, {
    document, window, chrome, Date:{now:() => now},
    setInterval(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); }
  });
  return {
    document, editor, calls, config, timers,
    pulses:() => calls.filter(call => call.type === 'insightPulse'),
    advance(ms) { now += ms; },
    async tick() { for (const fn of [...timers.values()]) fn(); await settle(); },
    async event(name, values = {}, surface = 'doc') {
      for (const fn of (surface === 'doc' ? docEvents : winEvents)[name] || []) fn({isTrusted:true,target:editor,...values});
      await settle();
    },
    async update(patch) { Object.assign(config, patch); changed({insightConfig:{newValue:{...config}}}, 'local'); await settle(); },
    async broadcast(patch) { Object.assign(config, patch); runtimeMessage({type:'insightConfigChanged'}); await settle(); },
    fail() { fail = true; }
  };
}
function node(kind, attrs = {}) {
  return {
    nodeType:1, disabled:false, readOnly:false,
    closest(selector) {
      if (selector === 'button') return kind === 'button' ? this : null;
      if (selector === 'form') return null;
      return kind === 'editor' ? this : null;
    },
    getAttribute(name) { return attrs[name] ?? null; },
    get value() { throw Error('Must not read editor value'); },
    get textContent() { throw Error('Must not read page text'); },
    get innerHTML() { throw Error('Must not read page HTML'); }
  };
}
test('starts with a viewing grace period, respects opt-in, and only runs in top frame', async () => {
  const h = harness(); await settle();
  assert.deepEqual(h.pulses(), [{type:'insightPulse',mode:'interacting',prompt:false}]);
  assert.equal(h.timers.size, 1);
  h.advance(60000); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'quiet');
  const off = harness({enabled:false}); await settle();
  assert.equal(off.pulses().length, 0); assert.equal(off.timers.size, 0);
  const frame = harness({topFrame:false}); await settle(); assert.equal(frame.calls.length, 0);
});
test('composer activity decays to interaction then quiet without reading content', async () => {
  const h = harness(); await settle();
  await h.event('input'); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'composing');
  h.advance(15000); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'interacting');
  h.advance(45000); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'quiet');
  assert.ok(h.pulses().every(pulse => Object.keys(pulse).sort().join(',') === 'mode,prompt,type'));
});
test('untrusted input, unrelated inputs, pointer moves, and automatic scrolling do not create activity', async () => {
  const h = harness(); await settle();
  h.advance(60000);
  await h.event('input', {isTrusted:false});
  await h.event('input', {target:node('other')});
  await h.event('pointermove'); await h.event('scroll'); await h.tick();
  assert.equal(h.pulses().at(-1).mode, 'quiet');
  await h.event('wheel', {isTrusted:false}); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'quiet');
  await h.event('wheel'); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'interacting');
  h.advance(60000); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'quiet');
  await h.event('touchmove'); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'interacting');
});
test('send attempts deduplicate and reject modified, repeated, or composing Enter', async () => {
  const h = harness(); await settle();
  for (const flag of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey', 'isComposing', 'repeat']) await h.event('keydown', {key:'Enter',[flag]:true});
  await h.event('keydown', {key:'Enter',keyCode:229});
  await h.event('keydown', {key:'Enter',target:node('other')});
  assert.equal(h.pulses().filter(pulse => pulse.prompt).length, 0);
  await h.event('keydown', {key:'Enter'});
  await h.event('click', {target:node('button', {'aria-label':'Send message'})});
  assert.equal(h.pulses().filter(pulse => pulse.prompt).length, 1);
  h.advance(2000);
  await h.event('click', {target:node('button', {'data-testid':'send-button'})});
  assert.equal(h.pulses().filter(pulse => pulse.prompt).length, 2);
});
test('send controls reject disabled, unrelated, and synthetic buttons', async () => {
  const h = harness(); await settle();
  const disabled = node('button', {'aria-label':'Send message'}); disabled.disabled = true;
  for (const target of [disabled, node('button', {'aria-label':'Resend invitation'}), node('button', {'aria-label':'Send message','aria-disabled':'true'})]) await h.event('click', {target});
  await h.event('click', {target:node('button', {'aria-label':'Send message'}), isTrusted:false});
  assert.equal(h.pulses().filter(pulse => pulse.prompt).length, 0);
});
test('hidden and unfocused pages never pulse and resume with one timer', async () => {
  const h = harness(); await settle();
  h.document.visibilityState = 'hidden'; await h.event('visibilitychange');
  const count = h.pulses().length;
  await h.event('keydown', {key:'Enter'}); await h.tick();
  assert.equal(h.pulses().length, count); assert.equal(h.timers.size, 0);
  h.document.visibilityState = 'visible'; h.document.focused = false;
  await h.event('visibilitychange'); assert.equal(h.timers.size, 0);
  h.document.focused = true; await h.event('focus', {}, 'win');
  assert.equal(h.pulses().at(-1).mode, 'interacting'); assert.equal(h.timers.size, 1);
  await h.event('focus', {}, 'win'); assert.equal(h.timers.size, 1);
});
test('pause and resume reset observed activity and refresh the quiet threshold', async () => {
  const h = harness(); await settle();
  await h.event('input'); await h.update({enabled:false});
  assert.equal(h.timers.size, 0);
  await h.update({enabled:true,quietSeconds:30});
  assert.equal(h.pulses().at(-1).mode, 'interacting');
  await h.event('pointerdown'); h.advance(30000); await h.tick();
  assert.equal(h.pulses().at(-1).mode, 'quiet');
});
test('invalidated extension stops timers and ignores later activity', async () => {
  const h = harness(); await settle();
  h.fail(); await h.tick(); const count = h.calls.length;
  assert.equal(h.timers.size, 0);
  await h.event('focus', {}, 'win'); await h.event('keydown', {key:'Enter'}); await h.tick();
  assert.equal(h.calls.length, count); assert.equal(h.timers.size, 0);
});
test('background configuration broadcast works without direct storage access', async () => {
  const h = harness({enabled:false}); await settle();
  await h.broadcast({enabled:true}); assert.equal(h.timers.size, 1);
  await h.broadcast({enabled:false}); assert.equal(h.timers.size, 0);
});
test('blur, hidden transition, and pagehide emit boundaries and refocus resets composition', async () => {
  const h = harness(); await settle();
  await h.event('input'); await h.tick(); assert.equal(h.pulses().at(-1).mode, 'composing');
  await h.event('blur', {}, 'win');
  assert.equal(h.calls.at(-1).type, 'insightBoundary'); assert.equal(h.timers.size, 0);
  await h.event('focus', {}, 'win'); assert.equal(h.pulses().at(-1).mode, 'interacting');
  h.document.visibilityState = 'hidden'; await h.event('visibilitychange');
  assert.equal(h.calls.at(-1).type, 'insightBoundary');
  await h.event('pagehide', {}, 'win'); assert.equal(h.calls.at(-1).type, 'insightBoundary');
  assert.equal(h.calls.filter(call => call.type === 'insightBoundary').length, 3);
  await h.update({enabled:false}); const count = h.calls.length;
  await h.event('blur', {}, 'win'); await h.event('pagehide', {}, 'win');
  assert.equal(h.calls.length, count);
});

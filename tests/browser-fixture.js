// Synthetic browser state for the UI smoke test. Runs the real worker and popup.
import {DEFAULTS} from '../model.js';
const event = () => ({listeners:[],addListener(fn){this.listeners.push(fn);},emit(...args){for(const fn of this.listeners)fn(...args);}});
const fixture = {
  store:JSON.parse(localStorage.getItem('fixture-settings') || 'null') || {tasks:structuredClone(DEFAULTS)},session:{},nextTab:10,nextGroup:20,
  tabs:[
    {id:1,windowId:1,title:'Understanding the cardiac cycle',url:'https://claude.ai/chat/heart',groupId:10,active:true},
    {id:2,windowId:1,title:'Cardiovascular physiology — reference',url:'https://example.org/physiology',groupId:10,active:false},
    {id:3,windowId:1,title:'A calmer plan for the week',url:'https://claude.ai/chat/plan',groupId:11,active:false},
    {id:4,windowId:1,title:'Working through linear algebra',url:'https://claude.ai/chat/math',groupId:12,active:false},
    {id:5,windowId:1,title:'Research with ChatGPT',url:'https://chatgpt.com/',groupId:-1,active:false}
  ],
  groups:[{id:10,windowId:1,title:'Medical · Claude',collapsed:false},{id:11,windowId:1,title:'To-do · Claude',collapsed:true},{id:12,windowId:1,title:'Math · Claude',collapsed:false}]
};
window.fixture=fixture;
const copy=value=>structuredClone(value);
window.chrome={
  runtime:{id:'fixture',onMessage:event(),onInstalled:event(),sendMessage(message){return new Promise(resolve=>chrome.runtime.onMessage.listeners[0](message,{id:'fixture'},resolve));}},
  windows:{async getCurrent(){return {id:1};}},
  storage:{onChanged:event(),local:{async get(){return copy(fixture.store);},async set(value){Object.assign(fixture.store,copy(value));localStorage.setItem('fixture-settings',JSON.stringify(fixture.store));chrome.storage.onChanged.emit();}},session:{async get(key){return {[key]:copy(fixture.session[key])};},async set(value){Object.assign(fixture.session,copy(value));},async remove(key){delete fixture.session[key];}}},
  tabs:{onUpdated:event(),onRemoved:event(),onCreated:event(),onActivated:event(),onAttached:event(),onDetached:event(),
    async query(query){return copy(fixture.tabs.filter(tab=>Object.entries(query).every(([key,value])=>tab[key]===value)));},
    async get(id){const tab=fixture.tabs.find(tab=>tab.id===id);if(!tab)throw Error('Tab closed');return copy(tab);},
    async update(id,patch){const tab=fixture.tabs.find(tab=>tab.id===id);if(!tab)throw Error('Tab closed');if(patch.active)fixture.tabs.filter(other=>other.windowId===tab.windowId).forEach(other=>other.active=false);Object.assign(tab,patch);},
    async group({tabIds,groupId,createProperties}){if(groupId===undefined){groupId=fixture.nextGroup++;fixture.groups.push({id:groupId,windowId:createProperties.windowId,collapsed:false});}fixture.tabs.filter(tab=>tabIds.includes(tab.id)).forEach(tab=>tab.groupId=groupId);return groupId;},
    async ungroup(ids){fixture.tabs.filter(tab=>[ids].flat().includes(tab.id)).forEach(tab=>tab.groupId=-1);},
    async create({url,windowId,active}){const tab={id:fixture.nextTab++,url,title:new URL(url).hostname,windowId,active,groupId:-1};fixture.tabs.push(tab);return copy(tab);}
  },
  tabGroups:{onUpdated:event(),onRemoved:event(),async query(query){return copy(fixture.groups.filter(group=>Object.entries(query).every(([key,value])=>group[key]===value)));},async update(id,patch){Object.assign(fixture.groups.find(group=>group.id===id),patch);}}
};
await import('../background.js');
await import('../popup.js');

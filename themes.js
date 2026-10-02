// All assets and palettes are bundled; no remote fonts or theme downloads.
export const THEMES = [
  {id:'paper',name:'Claude Paper',mood:'Warm & familiar',paper:'#f8f6f0',surface:'#fffdf8',soft:'#eeebe3',ink:'#36342e',muted:'#777167',line:'#e0dacf',accent:'#a75d40',palette:['#9878b5','#77947a','#728fb4','#bf875b','#b66f7d','#659e9a']},
  {id:'sage',name:'Sage Garden',mood:'A quieter workspace',paper:'#f1f5ef',surface:'#fafdf8',soft:'#e4eddf',ink:'#293c2e',muted:'#61715e',line:'#d1ddcc',accent:'#486b42',palette:['#64876b','#9a8bb2','#709eaa','#baa365','#b9807a','#88946a']},
  {id:'ocean',name:'Ocean Air',mood:'Clear & collected',paper:'#eff5fa',surface:'#f9fcff',soft:'#dfeaf3',ink:'#263f50',muted:'#5b7385',line:'#cddde9',accent:'#336d91',palette:['#689fc6','#68afa7','#9888bc','#cd9c6c','#ca859e','#8caaa0']},
  {id:'lavender',name:'Lavender Study',mood:'Soft concentration',paper:'#f5f1fa',surface:'#fdfaff',soft:'#ebe2f3',ink:'#423550',muted:'#7a6989',line:'#dfd3e9',accent:'#795398',palette:['#a185c4','#769b92','#8b9ec6','#c58cb2','#b6a276','#b78c7b']},
  {id:'rose',name:'Rose Quartz',mood:'A softer start',paper:'#fbf1f2',surface:'#fffafb',soft:'#f3e2e5',ink:'#51373e',muted:'#8b6670',line:'#e8d1d7',accent:'#a35470',palette:['#c5809c','#9a8abc','#82a497','#c3a16b','#7c9db5','#bf8972']},
  {id:'sand',name:'Desert Sand',mood:'Sunlit simplicity',paper:'#f8f2e8',surface:'#fffbf3',soft:'#eee1cf',ink:'#4d4030',muted:'#81705b',line:'#e1d3bd',accent:'#986231',palette:['#c6925e','#b77764','#8f9b75','#a88eb2','#6b9ba4','#b7a468']},
  {id:'mint',name:'Fresh Mint',mood:'Room to breathe',paper:'#eff8f5',surface:'#fafffd',soft:'#def0e9',ink:'#2b463d',muted:'#59796b',line:'#cce2d8',accent:'#387765',palette:['#62a58b','#79a6bb','#a397c7','#d1a76f','#c68e9d','#92ae70']},
  {id:'peach',name:'Peach Morning',mood:'A little optimism',paper:'#fff3ed',surface:'#fffcf9',soft:'#f7e3d6',ink:'#503b32',muted:'#8b6d5e',line:'#ebd5c7',accent:'#a46140',palette:['#d59573','#c28191','#a393bd','#7da59c','#89a4c2','#bfad72']},
  {id:'midnight',name:'Midnight Ink',mood:'After-hours clarity',dark:true,paper:'#1e2633',surface:'#283343',soft:'#303d50',ink:'#e8edf5',muted:'#a9b9cf',line:'#425169',accent:'#e4b28b',palette:['#b69ada','#8bbc9b','#85acd9','#d5ac73','#d893ae','#73bfc5']},
  {id:'forest',name:'Forest Night',mood:'Deep, calm focus',dark:true,paper:'#202c27',surface:'#2b3932',soft:'#35463d',ink:'#e6eee7',muted:'#adbdaf',line:'#475b4b',accent:'#b8cc93',palette:['#8db592','#b0a0d0','#8dbbc6','#d1b173','#ca9290','#a9bd7d']},
  {id:'plum',name:'Velvet Plum',mood:'Thoughtful evenings',dark:true,paper:'#2e2534',surface:'#3a3042',soft:'#463950',ink:'#f0e7f3',muted:'#c0acc9',line:'#5b4866',accent:'#d9acd3',palette:['#c39bda','#9dbbaa','#98afdc','#d6af80','#d895b9','#8ebfc2']},
  {id:'graphite',name:'Graphite',mood:'Nothing extra',dark:true,paper:'#252525',surface:'#303030',soft:'#3a3a3a',ink:'#efeee9',muted:'#bbb9b2',line:'#50504e',accent:'#d5bc95',palette:['#aaa0ca','#92b29a','#95abc8','#c9b17e','#c593a0','#8db8b4']}
];
export function getTheme(id) { return THEMES.find(theme => theme.id === id) || THEMES[0]; }

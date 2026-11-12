const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  list: (section) => ipcRenderer.invoke('lib:list', section),
  saveScript: (s) => ipcRenderer.invoke('scripts:save', s),
  deleteScript: (id) => ipcRenderer.invoke('scripts:delete', id),
  saveRecipe: (r) => ipcRenderer.invoke('recipes:save', r),
  pickVideo: (multi) => ipcRenderer.invoke('dialog:pickVideo', !!multi),
  probeVideo: (f) => ipcRenderer.invoke('video:probe', f),
  open: (p) => ipcRenderer.invoke('shell:open', p),
  show: (p) => ipcRenderer.invoke('shell:show', p),
  deleteEdited: (id) => ipcRenderer.invoke('edited:delete', id),
  reviseEdited: (o) => ipcRenderer.invoke('edited:revise', o),
  quickEdited: (o) => ipcRenderer.invoke('edited:quick', o),
  restoreEdited: (o) => ipcRenderer.invoke('edited:restore', o),
  renameEdited: (o) => ipcRenderer.invoke('edited:rename', o),
  saveEditedCaption: (o) => ipcRenderer.invoke('edited:saveCaption', o),
  chatGet: (id) => ipcRenderer.invoke('chat:get', id),
  chatNew: (id) => ipcRenderer.invoke('chat:new', id),
  chatSend: (o) => ipcRenderer.invoke('chat:send', o),
  onChat: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('chat:changed', h);
    return () => ipcRenderer.removeListener('chat:changed', h);
  },
  editorLoad: (id) => ipcRenderer.invoke('editor:load', id),
  editorSave: (o) => ipcRenderer.invoke('editor:save', o),
  editorAssets: (id) => ipcRenderer.invoke('editor:assets', id),
  editorSourceAssets: (src) => ipcRenderer.invoke('editor:sourceAssets', src),
  editorImportVideos: (o) => ipcRenderer.invoke('editor:importVideos', o),
  editorPeaks: (file) => ipcRenderer.invoke('editor:peaks', file),
  editorRender: (o) => ipcRenderer.invoke('editor:render', o),
  editorReimport: (id) => ipcRenderer.invoke('editor:reimport', id),
  onEditorRendered: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('editor:rendered', h);
    return () => ipcRenderer.removeListener('editor:rendered', h);
  },
  trendsGet: () => ipcRenderer.invoke('trends:get'),
  trendsRefresh: () => ipcRenderer.invoke('trends:refresh'),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
  deleteReference: (id) => ipcRenderer.invoke('references:delete', id),
  addReference: (r) => ipcRenderer.invoke('references:add', r),
  skillPrompt: (id) => ipcRenderer.invoke('references:skillPrompt', id),
  saveSkill: (id) => ipcRenderer.invoke('references:saveSkill', id),
  prepareEdit: (o) => ipcRenderer.invoke('edit:prepare', o),
  discardEdit: (id) => ipcRenderer.invoke('edit:discard', id),
  runEdit: (o) => ipcRenderer.invoke('edit:run', o),
  toolsList: (cat) => ipcRenderer.invoke('tools:list', cat),
  toolsAdd: (cat, files) => ipcRenderer.invoke('tools:add', { cat, files }),
  toolsPreset: (o) => ipcRenderer.invoke('tools:preset', o),
  toolsMeta: (o) => ipcRenderer.invoke('tools:meta', o),
  toolsRemove: (cat, file) => ipcRenderer.invoke('tools:remove', { cat, file }),
  toolsOpenDir: (cat) => ipcRenderer.invoke('tools:openDir', cat),
  cancelJob: (id) => ipcRenderer.invoke('job:cancel', id),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  // carruseles
  carouselFormats: () => ipcRenderer.invoke('carousel:formats'),
  pickImages: () => ipcRenderer.invoke('dialog:pickImages'),
  carouselPrepare: (o) => ipcRenderer.invoke('carousel:prepare', o),
  carouselDiscard: (id) => ipcRenderer.invoke('carousel:discard', id),
  carouselRun: (o) => ipcRenderer.invoke('carousel:run', o),
  carouselDelete: (id) => ipcRenderer.invoke('carousel:delete', id),
  carouselSaveCaption: (o) => ipcRenderer.invoke('carousel:saveCaption', o),
  carouselChatGet: (id) => ipcRenderer.invoke('carousel:chatGet', id),
  carouselChatNew: (id) => ipcRenderer.invoke('carousel:chatNew', id),
  carouselChatSend: (o) => ipcRenderer.invoke('carousel:chatSend', o),
  carouselRefAdd: (o) => ipcRenderer.invoke('carouselRefs:add', o),
  carouselRefDelete: (id) => ipcRenderer.invoke('carouselRefs:delete', id),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  login: () => ipcRenderer.invoke('auth:login'),
  onAuth: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('auth:changed', h);
    return () => ipcRenderer.removeListener('auth:changed', h);
  },
  onJob: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('job:event', h);
    return () => ipcRenderer.removeListener('job:event', h);
  },
  onChanged: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('lib:changed', h);
    return () => ipcRenderer.removeListener('lib:changed', h);
  },
  // Para arrastrar archivos desde el explorador
  pathForFile: (file) => require('electron').webUtils.getPathForFile(file),
});

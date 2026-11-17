// Bridge for the app's normal windows (calendar setup + my reminders).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  // calendar link
  status: () => ipcRenderer.invoke('setup:status'),
  save: (link) => ipcRenderer.invoke('setup:save', link),
  remove: () => ipcRenderer.invoke('setup:remove'),
  // your own reminders
  listReminders: () => ipcRenderer.invoke('reminders:list'),
  addReminder: (r) => ipcRenderer.invoke('reminders:add', r),
  deleteReminder: (id) => ipcRenderer.invoke('reminders:delete', id),
  // navigation
  openCalendarSetup: () => ipcRenderer.send('open-window', 'setup'),
  openReminders: () => ipcRenderer.send('open-window', 'reminders'),
  openUrl: (url) => ipcRenderer.send('open-url', url),
});

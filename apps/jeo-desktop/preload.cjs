// Safe bridge between the editor page and the desktop app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jeoDesktop", {
	isDesktop: true,
	writeProject: (args) => ipcRenderer.invoke("jeo:writeProject", args),
	listProjects: () => ipcRenderer.invoke("jeo:listProjects"),
	trashProject: (args) => ipcRenderer.invoke("jeo:trashProject", args),
	writeMedia: (args) => ipcRenderer.invoke("jeo:writeMedia", args),
	listMedia: (args) => ipcRenderer.invoke("jeo:listMedia", args),
	readMedia: (args) => ipcRenderer.invoke("jeo:readMedia", args),
	deleteMedia: (args) => ipcRenderer.invoke("jeo:deleteMedia", args),
	showProjectFolder: (args) => ipcRenderer.invoke("jeo:showProjectFolder", args),
});

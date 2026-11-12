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
	listAssets: () => ipcRenderer.invoke("jeo:listAssets"),
	readAsset: (args) => ipcRenderer.invoke("jeo:readAsset", args),
	showAssetsFolder: (args) => ipcRenderer.invoke("jeo:showAssetsFolder", args),
	trackPoint: (args) => ipcRenderer.invoke("jeo:trackPoint", args),
	chatSend: (args) => ipcRenderer.invoke("jeo:chatSend", args),
	chatStop: () => ipcRenderer.invoke("jeo:chatStop"),
	onChatEvent: (listener) => {
		const handler = (_event, payload) => listener(payload);
		ipcRenderer.on("jeo:chatEvent", handler);
		return () => ipcRenderer.removeListener("jeo:chatEvent", handler);
	},
	exportToCapCut: (args) => ipcRenderer.invoke("jeo:exportToCapCut", args),
	readChat: (args) => ipcRenderer.invoke("jeo:readChat", args),
	writeChat: (args) => ipcRenderer.invoke("jeo:writeChat", args),
	showProjectFolder: (args) => ipcRenderer.invoke("jeo:showProjectFolder", args),
});

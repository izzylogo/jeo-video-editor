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
	chatStop: (args) => ipcRenderer.invoke("jeo:chatStop", args || {}),
	getJobs: () => ipcRenderer.invoke("jeo:jobs"),
	jobSeen: (args) => ipcRenderer.invoke("jeo:jobSeen", args),
	setMaxJobs: (args) => ipcRenderer.invoke("jeo:setMaxJobs", args),
	setActiveProject: (args) => ipcRenderer.invoke("jeo:activeProject", args),
	releaseProject: (args) => ipcRenderer.invoke("jeo:releaseProject", args),
	leftProject: (args) => ipcRenderer.invoke("jeo:leftProject", args),
	claimProject: (args) => ipcRenderer.invoke("jeo:claimProject", args),
	onJobs: (listener) => {
		const handler = (_event, state) => listener(state);
		ipcRenderer.on("jeo:jobs", handler);
		return () => ipcRenderer.removeListener("jeo:jobs", handler);
	},
	onProjectChangedElsewhere: (listener) => {
		const handler = (_event, info) => listener(info);
		ipcRenderer.on("jeo:projectChangedElsewhere", handler);
		return () => ipcRenderer.removeListener("jeo:projectChangedElsewhere", handler);
	},
	onChatEvent: (listener) => {
		const handler = (_event, payload) => listener(payload);
		ipcRenderer.on("jeo:chatEvent", handler);
		return () => ipcRenderer.removeListener("jeo:chatEvent", handler);
	},
	onUpdateReady: (listener) => {
		const handler = (_event, items) => listener(items);
		ipcRenderer.on("jeo:updateReady", handler);
		return () => ipcRenderer.removeListener("jeo:updateReady", handler);
	},
	updateNow: (args) => ipcRenderer.invoke("jeo:updateNow", args),
	exportToCapCut: (args) => ipcRenderer.invoke("jeo:exportToCapCut", args),
	capcutDraftCheck: (args) => ipcRenderer.invoke("jeo:capcutDraftCheck", args),
	listTrashedProjectIds: () => ipcRenderer.invoke("jeo:listTrashedProjectIds"),
	checkGitHub: () => ipcRenderer.invoke("jeo:checkGitHub"),
	pullUpdate: () => ipcRenderer.invoke("jeo:pullUpdate"),
	appInfo: () => ipcRenderer.invoke("jeo:appInfo"),
	setTitleBar: (args) => ipcRenderer.invoke("jeo:setTitleBar", args),
	showAppMenu: () => ipcRenderer.invoke("jeo:showAppMenu"),
	onRemoteUpdate: (listener) => {
		const handler = (_event, info) => listener(info);
		ipcRenderer.on("jeo:remoteUpdate", handler);
		return () => ipcRenderer.removeListener("jeo:remoteUpdate", handler);
	},
	onPullProgress: (listener) => {
		const handler = (_event, stage) => listener(stage);
		ipcRenderer.on("jeo:pullProgress", handler);
		return () => ipcRenderer.removeListener("jeo:pullProgress", handler);
	},
	capcutList: () => ipcRenderer.invoke("jeo:capcutList"),
	capcutWindowOpen: () => ipcRenderer.invoke("jeo:capcutWindowOpen"),
	readLiveMedia: (args) => ipcRenderer.invoke("jeo:readLiveMedia", args),
	capcutPlan: (args) => ipcRenderer.invoke("jeo:capcutPlan", args),
	capcutReadFile: (args) => ipcRenderer.invoke("jeo:capcutReadFile", args),
	readChat: (args) => ipcRenderer.invoke("jeo:readChat", args),
	writeChat: (args) => ipcRenderer.invoke("jeo:writeChat", args),
	showProjectFolder: (args) => ipcRenderer.invoke("jeo:showProjectFolder", args),
});

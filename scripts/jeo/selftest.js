// Run inside a hidden JEO Editor window by report.ps1. It makes a throwaway
// project in a temporary folder, does a few real edits and reports what worked.
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const out = { steps: [] };
  const step = (name, ok, detail) => out.steps.push({ name, ok: !!ok, detail: detail ? String(detail).slice(0, 160) : "" });
  try {
    for (let i = 0; i < 120 && !(window.__jeoEditor && window.__jeoControl); i++) await sleep(500);
    step("The editor opened", !!window.__jeoEditor, window.__jeoEditor ? "" : "the editor did not load in 60 s");
    if (!window.__jeoEditor || !window.__jeoControl) return out;
    const editor = window.__jeoEditor;
    const call = (name, args) => window.__jeoControl.callTool({ name, args });
    await sleep(2500);

    const project = editor.project.getActiveOrNull();
    step("A project is open", !!project, project ? project.metadata.name : "");
    const size = project?.settings.canvasSize;
    step("Frame is 1080 x 1440", size && size.width === 1080 && size.height === 1440, size ? `${size.width} x ${size.height}` : "");

    const tools = window.__jeoControl.listTools();
    step("Claude's editing tools are loaded", tools.length >= 20, `${tools.length} tools`);
    step("Caption font LEMON MILK is loaded", document.fonts.check('700 40px "LEMON MILK"'), "");
    step("Interface font Poppins is loaded", document.fonts.check('500 12px "Poppins"'), "");
    step("Desktop link (saving to disk) is there", !!window.jeoDesktop, "");

    const added = await call("add_text", { kind: "scene", text: "*SELF TEST*", start: 0, end: 2 });
    step("Add a caption", added.ok, added.ok ? added.result.text : added.error);
    if (added.ok) {
      const offered = await call("offer_text_options", { id: added.result.id, options: ["*OPTION ONE*", "*OPTION TWO*"] });
      step("Attach other wordings to it", offered.ok, offered.error);
      const flash = await call("add_effect", { kind: "flash", at: 0.5 });
      step("Add a colour flash", flash.ok, flash.error);
      const view = await call("view_timeline", { times: [1] });
      step("Draw a frame of the edit", view.ok && typeof view.image === "string" && view.image.length > 2000, view.error);
      const undone = await call("undo", { steps: 3 });
      step("Undo", undone.ok, undone.error);
    }
    try {
      await editor.project.saveCurrentProject();
      await sleep(1500);
      const onDisk = await window.jeoDesktop.listProjects();
      step("Save the project as a folder on disk", onDisk.length >= 1, `${onDisk.length} project folder(s)`);
    } catch (error) {
      step("Save the project as a folder on disk", false, error);
    }
    const gpu = editor.renderer?.isDegraded;
    step("Graphics run at full speed (not the slow fallback)", gpu === false, gpu ? "slow fallback mode on this computer" : "");
  } catch (error) {
    step("Self-test ran to the end", false, (error && error.stack) || error);
  }
  return out;
})()

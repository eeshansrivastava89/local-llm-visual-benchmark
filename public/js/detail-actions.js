import { els } from "./dom.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { deleteJson, postJson } from "./api.js";
import { detailActionAvailability, detailViewModel } from "./detail-ui.js";
import { closeModal, openModal } from "./modals.js";
import { canUseOperationalControls, setOperationalAvailability, syncOperationalControls } from "./operational-controls.js";
import { copyTextToClipboard } from "./clipboard.js";
import { setButtonLabel } from "./icons.js";
import { renderHarnesses, renderModelSources, renderModels, renderRuns } from "./workbench-controller.js";
import { renderPrepOptions } from "./prepare-controller.js";

export async function copyDetailPrompt() {
  const text = els.detailPrompt.textContent ?? "";
  await copyTextToClipboard(text, els.copyDetailPrompt, "Copy prompt");
}

export function requestDeleteSelectedRun() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    return;
  }

  els.deleteRunPath.textContent = run.runDirectory;
  openModal("deleteConfirm");
}

export async function confirmDeleteSelectedRun() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    closeModal("deleteConfirm");
    return;
  }

  els.confirmDeleteRun.disabled = true;
  if (els.deleteRun) els.deleteRun.disabled = true;
  try {
    await deleteJson("/api/runs", { runDirectory: run.runDirectory });
    state.runs = state.runs.filter((item) => item.runDirectory !== run.runDirectory);
    closeModal("deleteConfirm");
    closeModal("detail");
    state.selectedRun = null;
    renderModels();
    renderHarnesses();
    renderModelSources();
    renderPrepOptions();
    renderRuns();
  } catch (error) {
    window.alert("Delete failed: " + error.message);
  } finally {
    els.confirmDeleteRun.disabled = false;
    if (els.deleteRun) els.deleteRun.disabled = false;
  }
}

export async function openSelectedRunHtml() {
  const run = state.selectedRun;
  if (!run?.runDirectory || !run.assets?.html || !canUseOperationalControls()) {
    return;
  }

  els.openHtml.disabled = true;
  try {
    await postJson("/api/open-html", {
      runDirectory: run.runDirectory,
      asset: run.assets.html
    });
  } catch (error) {
    els.detailMeta.innerHTML +=
      '<span class="meta-label">Open HTML</span><strong>' + escapeHtml(error.message) + "</strong>";
  } finally {
    updateDetailActions(run);
  }
}

export async function copySelectedRunPath() {
  const run = state.selectedRun;
  if (!run?.runDirectory) {
    return;
  }

  await copyTextToClipboard(run.runDirectory, els.copyDetailPath, "Copy path");
}

export async function openSelectedRunFolder(button = els.openRunFolder, errorTarget = els.detailMeta) {
  const run = state.selectedRun;
  if (!run?.runDirectory || !canUseOperationalControls()) {
    return;
  }

  button.disabled = true;
  try {
    await postJson("/api/open-run-folder", {
      runDirectory: run.runDirectory
    });
  } catch (error) {
    errorTarget.innerHTML +=
      '<span class="meta-label">Open folder</span><strong>' + escapeHtml(error.message) + "</strong>";
  } finally {
    updateDetailActions(run);
  }
}

export function openDetail(run) {
  state.selectedRun = run;
  renderDetail(run);
  openModal("detail");
}

export function renderDetail(run) {
  const detail = detailViewModel(run);
  els.detailBackdrop.querySelector(".detail-shell")?.setAttribute("data-detail-kind", "visual");
  els.detailTitle.textContent = detail.title;
  els.detailSubtitle.textContent = detail.subtitle;
  els.detailPreview.innerHTML = detail.previewHtml;
  updateDetailActions(run);
  els.detailTextTitle.textContent = detail.textRecord.title;
  els.detailPrompt.textContent = detail.promptText;
  els.promptLength.textContent = detail.promptLength;
  setButtonLabel(els.copyDetailPrompt, detail.textRecord.copyLabel, "copy");
  els.copyDetailPrompt.disabled = !detail.canCopyPrompt;
  els.detailMeta.innerHTML = detail.metaHtml;
}

export function updateDetailActions(run) {
  const availability = detailActionAvailability(run);
  setOperationalAvailability(els.openHtml, availability.openHtml);
  setOperationalAvailability(els.copyDetailPath, availability.copyPath);
  setOperationalAvailability(els.openRunFolder, availability.openRunFolder);
  setOperationalAvailability(els.recaptureRun, availability.showCapture);
  setOperationalAvailability(els.deleteRun, availability.deleteRun);
  syncOperationalControls();

  const canOperate = canUseOperationalControls();
  els.openHtml.disabled = !canOperate || !availability.openHtml;
  els.copyDetailPath.disabled = !canOperate || !availability.copyPath;
  els.openRunFolder.disabled = !canOperate || !availability.openRunFolder;
  els.recaptureRun.disabled = !canOperate || !availability.capture || state.captureBusy;
  els.deleteRun.disabled = !canOperate || !availability.deleteRun;
  els.recaptureRun.title = availability.capture
    ? ""
    : "Recapture needs index.html in this run folder. Click Refresh after adding the file.";
  if (state.captureBusy && state.captureRunDirectory === run.runDirectory) {
    setButtonLabel(els.recaptureRun, "Capturing…", "camera");
    return;
  }
  setButtonLabel(els.recaptureRun, availability.recaptureLabel, "camera");
}

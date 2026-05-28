import { els } from "./dom.js";
import { state } from "./state.js";
import { loadLocalData, refreshAndCaptureMissing, refreshRunsForPolling } from "./data-controller.js";
import { loadConnection, loadModelSyncState, loadModels, loadOmlxModels, syncModels } from "./model-source-controller.js";
import { captureMissingMedia, captureRunMedia, captureSelectedRunMedia } from "./capture-controller.js";
import { initChartLightbox } from "./chart-lightbox.js";
import { scoreDsRun } from "./score-controller.js";
import {
  configureWorkbenchController,
  renderBenchmarks,
  renderHarnesses,
  renderKindTabs,
  renderModels,
  renderRuns,
  resetRunPage
} from "./workbench-controller.js";
import {
  copyPreparedPrompt,
  copyPreparedRunPath,
  prepareRunSlot,
  renderPrepKindTabs,
  renderPrepOptions,
  resetPrepareRunModal,
  updatePrepareMode
} from "./prepare-controller.js";
import {
  confirmDeleteSelectedRun,
  copyDetailPrompt,
  copySelectedRunPath,
  openDetail,
  openSelectedRunFolder,
  openSelectedRunHtml,
  requestDeleteSelectedRun,
  updateDetailActions
} from "./detail-actions.js";
import { closeModal, handleModalKeydown, openModal } from "./modals.js";
import { applyStoredTheme, toggleTheme } from "./theme.js";
import { initSourceStatuses } from "./setup-ui.js";
import { wireHelpTooltips } from "./tooltips.js";
import { renderViewTabs, updateOnboarding } from "./ui.js";
import { canUseOperationalControls, configureOperationalControls } from "./operational-controls.js";
import { runKind } from "./runs.js";
import { loadMachineProfile } from "./machine-profile.js";

init();

function init() {
  initWorkspaceState();
  configureControllers();
  applyStoredTheme();
  wireEvents();
  initSourceStatuses();
  initChartLightbox();
  renderViewTabs();
  updateOnboarding();
  void loadLocalData();
  void loadMachineProfile();
  setInterval(() => {
    if (!state.staticMode) {
      void loadOmlxModels();
      if (state.lmConnected) void loadModels();
      else void loadConnection();
    }
  }, 60000);
  setInterval(() => {
    if (!state.staticMode) {
      void loadModelSyncState();
    }
  }, 12000);
}

function initWorkspaceState() {
  state.workspace = "visual";
  state.mode = "benchmark";
  state.staticMode = document.body?.dataset.staticBuild === "true";

  // Restore persisted kind tab selection
  try {
    const savedKind = localStorage.getItem("selectedKind");
    if (savedKind === "visual" || savedKind === "data-science") {
      state.selectedKind = savedKind;
      document.body.dataset.workspace = savedKind;
    }
  } catch { /* localStorage unavailable */ }
}

function configureControllers() {
  configureOperationalControls({
    onSelectedRunControlsUpdate: updateDetailActions
  });
  configureWorkbenchController({
    canUseOperationalControls,
    onCaptureRunMedia: captureRunMedia,
    onScoreDsRun: scoreDsRun,
    onOpenDetail: openDetail
  });
}

function refreshModelSources() {
  if (state.staticMode) {
    return;
  }

  void refreshRunsForPolling();
  void loadOmlxModels();
  void loadConnection();
}

function wireEvents() {
  els.refreshOmlx.addEventListener("click", () => loadOmlxModels({ manual: true }));
  els.refreshConnection.addEventListener("click", () => loadConnection({ manual: true }));
  els.refreshRuns.addEventListener("click", () => refreshAndCaptureMissing());
  els.syncPiBtn.addEventListener("click", () => syncModels(["pi"]));
  els.syncOpenCodeBtn.addEventListener("click", () => syncModels(["opencode"]));

  els.themeToggle.addEventListener("click", () => toggleTheme());
  els.setupToggle.addEventListener("click", () => {
    openModal("setup");
    refreshModelSources();
  });
  els.runToggle.addEventListener("click", () => {
    openModal("prep");
    renderPrepKindTabs();
    resetPrepareRunModal();
    refreshModelSources();
  });

  els.closeDetail.addEventListener("click", () => closeModal("detail"));
  els.closePrep.addEventListener("click", () => closeModal("prep"));
  els.closeSetup.addEventListener("click", () => closeModal("setup"));
  els.closeDeleteConfirm.addEventListener("click", () => closeModal("deleteConfirm"));
  els.cancelDeleteRun.addEventListener("click", () => closeModal("deleteConfirm"));
  els.confirmDeleteRun.addEventListener("click", () => confirmDeleteSelectedRun());
  document.addEventListener("keydown", handleModalKeydown);
  wireHelpTooltips();

  els.detailBackdrop.addEventListener("click", (event) => {
    if (event.target === els.detailBackdrop) closeModal("detail");
  });
  els.prepBackdrop.addEventListener("click", (event) => {
    if (event.target === els.prepBackdrop) closeModal("prep");
  });
  els.setupBackdrop.addEventListener("click", (event) => {
    if (event.target === els.setupBackdrop) closeModal("setup");
  });
  els.deleteConfirmBackdrop.addEventListener("click", (event) => {
    if (event.target === els.deleteConfirmBackdrop) closeModal("deleteConfirm");
  });

  els.deleteRun.addEventListener("click", () => requestDeleteSelectedRun());
  els.openHtml.addEventListener("click", () => openSelectedRunHtml());
  els.copyDetailPath.addEventListener("click", () => copySelectedRunPath());
  els.openRunFolder.addEventListener("click", () => openSelectedRunFolder(els.openRunFolder, els.detailMeta));
  els.recaptureRun.addEventListener("click", () => {
    const run = state.selectedRun;
    if (run && runKind(run) === "data-science") {
      void scoreDsRun(run);
    } else {
      captureSelectedRunMedia({ force: true });
    }
  });
  els.copyDetailPrompt.addEventListener("click", () => copyDetailPrompt());

  els.modelFilter.addEventListener("change", () => {
    state.selectedModel = els.modelFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.benchmarkFilter.addEventListener("change", () => {
    state.selectedBenchmark = els.benchmarkFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.harnessFilter.addEventListener("change", () => {
    state.selectedHarness = els.harnessFilter.value;
    resetRunPage();
    renderRuns();
  });
  els.runsSearch.addEventListener("input", () => {
    state.runsSearch = els.runsSearch.value;
    resetRunPage();
    renderRuns();
  });
  els.filtersToggle?.addEventListener("click", () => {
    const isOpen = els.toolbarFilterGroup.classList.toggle("is-open");
    els.filtersToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
  els.clearWorkbenchState.addEventListener("click", () => {
    state.selectedModel = "all";
    state.selectedBenchmark = "all";
    state.selectedHarness = "all";
    state.selectedKind = "visual";
    state.runsSearch = "";
    state.compareSelection = [];
    els.runsSearch.value = "";
    document.body.dataset.workspace = "visual";
    try { localStorage.removeItem("selectedKind"); } catch {}
    resetRunPage();
    renderKindTabs();
    renderBenchmarks();
    renderModels();
    renderHarnesses();
    renderRuns();
  });
  els.prepareRun.addEventListener("click", () => prepareRunSlot());
  els.copyPreparedPath.addEventListener("click", () => copyPreparedRunPath());
  els.copyPrompt.addEventListener("click", () => copyPreparedPrompt());
  els.prepRunner.addEventListener("change", () => updatePrepareMode());
  els.prepModelSource.addEventListener("change", () => {
    state.selectedModelSource = els.prepModelSource.value;
    renderPrepOptions();
  });
  els.prepBenchmark.addEventListener("change", () => updatePrepareMode());
  els.prepModelSelect.addEventListener("change", () => {
    updatePrepareMode();
  });
  els.prepCustomBackend.addEventListener("input", () => updatePrepareMode());
  els.prepCustomModel.addEventListener("input", () => updatePrepareMode());

  els.viewTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      resetRunPage();
      renderViewTabs();
      renderRuns();
    });
  });

  els.kindTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedKind = button.dataset.kind;
      state.selectedBenchmark = "all";
      state.selectedModel = "all";
      state.selectedHarness = "all";
      document.body.dataset.workspace = state.selectedKind;
      try { localStorage.setItem("selectedKind", state.selectedKind); } catch {}
      resetRunPage();
      renderKindTabs();
      renderBenchmarks();
      renderModels();
      renderHarnesses();
      renderRuns();
    });
  });

  els.prepKindTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPrepKind = button.dataset.prepKind;
      renderPrepKindTabs();
      renderPrepOptions();
      updatePrepareMode();
    });
  });

  if (els.dismissOnboarding) {
    els.dismissOnboarding.addEventListener("click", () => {
      state.onboardingDismissed = true;
      try { localStorage.setItem("onboardingDismissed", "1"); } catch {}
      if (els.onboardingPanel) els.onboardingPanel.hidden = true;
    });
  }

  document.addEventListener("capture-pending", () => {
    void captureMissingMedia();
  });
}

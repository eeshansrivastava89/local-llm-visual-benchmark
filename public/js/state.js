export const state = {
  staticMode: false,
  benchmarks: [],
  runs: [],
  writesEnabled: true,
  captureBusy: false,
  stats: null,
  machineProfile: null,
  selectedModel: "all",
  selectedBenchmark: "all",
  selectedHarness: "all",
  selectedKind: "visual",
  runsSearch: "",
  runPage: 1,
  runsPerPage: 10,
  workspace: "visual",
  mode: "model",
  showCloudModels: false,
  refreshBusy: false,
  selectedRun: null,
  compareSelection: [],
  comparisonExportBusy: false,
  captureRunDirectory: "",
  scoreBusy: false,
  scoreRunDirectory: "",
  onboardingDismissed: false,
  htmlPollInterval: null,

  // Internal state for model discovery polling (no longer rendered to UI)
  discoveredModels: [],
  omlxModels: [],
  lmStudioModels: [],
  omlxConnected: false,
  lmConnected: false,
  modelSync: {
    enabled: false,
    paths: { opencode: "", pi: "" },
    files: {
      opencode: { exists: false, modelIds: [] },
      pi: { exists: false, modelIds: [] }
    }
  }
};
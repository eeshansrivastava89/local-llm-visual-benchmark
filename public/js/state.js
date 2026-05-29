export const state = {
  staticMode: false,
  benchmarks: [],
  discoveredModels: [],
  omlxModels: [],
  lmStudioModels: [],
  modelSync: {
    enabled: false,
    paths: {
      opencode: "",
      pi: ""
    },
    files: {
      opencode: {
        exists: false,
        modelIds: []
      },
      pi: {
        exists: false,
        modelIds: []
      }
    }
  },
  omlxConnected: false,
  lmConnected: false,
  sourceHealth: {
    omlx: {
      status: "checking",
      count: 0,
      message: "Checking oMLX model server."
    },
    lmstudio: {
      status: "checking",
      count: 0,
      message: "Checking LM Studio model server."
    }
  },
  writesEnabled: true,
  syncBusy: false,
  captureBusy: false,
  runs: [],
  stats: null,
  machineProfile: null,
  selectedModel: "all",
  selectedBenchmark: "all",
  selectedHarness: "all",
  selectedKind: "visual",
  selectedPrepKind: "visual",
  runsSearch: "",
  runPage: 1,
  runsPerPage: 10,
  workspace: "visual",
  mode: "model",
  showCloudModels: false,
  selectedModelSource: "omlx",
  preparedPrompt: "",
  preparedRunDirectory: "",
  refreshBusy: false,
  selectedRun: null,
  compareSelection: [],
  comparisonExportBusy: false,
  captureRunDirectory: "",
  scoreBusy: false,
  scoreRunDirectory: "",
  onboardingDismissed: false,
  htmlPollInterval: null
};

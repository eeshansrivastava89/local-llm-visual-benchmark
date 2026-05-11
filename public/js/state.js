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
  selectedModel: "all",
  selectedBenchmark: "all",
  runsSearch: "",
  runPage: 1,
  runsPerPage: 25,
  workspace: "visual",
  mode: "benchmark",
  selectedModelSource: "omlx",
  preparedPrompt: "",
  selectedRun: null,
  captureRunDirectory: "",
  modalFocusReturn: {},
  onboardingDismissed: false,
  htmlPollInterval: null
};

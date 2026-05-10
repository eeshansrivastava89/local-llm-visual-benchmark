export const state = {
  staticMode: false,
  benchmarks: [],
  discoveredModels: [],
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
  lmConnected: false,
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
  preparedPrompt: "",
  selectedRun: null,
  captureRunDirectory: "",
  modalFocusReturn: {},
  onboardingDismissed: false,
  htmlPollInterval: null
};

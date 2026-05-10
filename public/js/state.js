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
  selectedKind: "all",
  selectedStatus: "all",
  selectedRunner: "all",
  runsSearch: "",
  runPage: 1,
  runsPerPage: 25,
  mode: "gallery",
  preparedPrompt: "",
  selectedRun: null,
  captureRunDirectory: "",
  prepKind: "visual",
  modalFocusReturn: {},
  section: "visual",
  onboardingDismissed: false,
  htmlPollInterval: null
};

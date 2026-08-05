import { reactive } from 'vue';
import {
  createPraxisSsoClient,
  praxisSsoErrorMessage,
} from './praxisSsoClient';

export type PraxisSsoEntryStatus = 'idle' | 'launching' | 'error';

export function createPraxisSsoEntryController(
  launch: () => Promise<void>,
) {
  const state = reactive<{
    status: PraxisSsoEntryStatus;
    errorMessage: string | null;
  }>({
    status: 'idle',
    errorMessage: null,
  });
  let autoLaunchConsumed = false;
  let inFlight: Promise<void> | null = null;

  function start() {
    if (inFlight) return inFlight;

    state.status = 'launching';
    state.errorMessage = null;
    inFlight = launch()
      .catch((error) => {
        state.status = 'error';
        state.errorMessage = praxisSsoErrorMessage(error);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function startAutomatically() {
    if (autoLaunchConsumed) return inFlight ?? Promise.resolve();
    autoLaunchConsumed = true;
    return start();
  }

  function retry() {
    return start();
  }

  return {
    state,
    startAutomatically,
    retry,
  };
}

const praxisSsoClient = createPraxisSsoClient();

// This singleton keeps the automatic-launch guard and visible failure state
// across route remounts within the same browser page. Explicit retry remains
// available after a failed launch.
export const praxisSsoEntryController = createPraxisSsoEntryController(
  () => praxisSsoClient.launch(),
);

/**
 * ForceGraph3D renders every animation frame, even when nothing on screen
 * can change. A settled side-panel map then keeps the GPU and the main
 * thread busy beside the editor. The governor pauses that loop once the
 * camera has stopped, layout has settled and no input has arrived for a
 * short quiet, and restarts it on the next input, data change or camera
 * move request. A moving camera (idle orbit, damping, a fly-to) keeps it
 * running, so motion never stalls.
 */

export type RenderGovernor = {
  /** Something may change on screen: keep (or start) rendering for a while. */
  kick: (ms?: number) => void;
  /** Once per rendered frame, with the camera world matrix for this frame. */
  frame: (cameraMatrix: ArrayLike<number>, busy: boolean) => void;
  readonly paused: boolean;
  dispose: () => void;
};

export function createRenderGovernor(opts: {
  pause: () => void;
  resume: () => void;
  quietMs?: number;
  now?: () => number;
}): RenderGovernor {
  const quietMs = opts.quietMs ?? 450;
  const now = opts.now ?? (() => performance.now());
  let activeUntil = now() + quietMs;
  let paused = false;
  let disposed = false;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  const lastCam = new Float64Array(16);
  let haveCam = false;

  const resume = () => {
    if (!paused || disposed) return;
    paused = false;
    opts.resume();
  };

  const kick = (ms = quietMs) => {
    if (disposed) return;
    activeUntil = Math.max(activeUntil, now() + ms);
    resume();
  };

  const frame = (cameraMatrix: ArrayLike<number>, busy: boolean) => {
    if (disposed) return;
    let moved = !haveCam;
    for (let i = 0; i < 16; i++) {
      const v = cameraMatrix[i];
      if (!moved && Math.abs(v - lastCam[i]) > 1e-7) moved = true;
      lastCam[i] = v;
    }
    haveCam = true;
    if (moved || busy) activeUntil = Math.max(activeUntil, now() + quietMs);
    if (now() < activeUntil || pauseTimer !== null) return;
    // The loop re-arms its next frame after this render returns, so the
    // pause has to happen outside the frame.
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      if (disposed || paused || now() < activeUntil) return;
      paused = true;
      opts.pause();
    }, 0);
  };

  return {
    kick,
    frame,
    get paused() {
      return paused;
    },
    dispose: () => {
      disposed = true;
      if (pauseTimer !== null) clearTimeout(pauseTimer);
      pauseTimer = null;
    },
  };
}

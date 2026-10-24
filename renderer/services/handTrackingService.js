// Camera -> hand landmarks, on this computer (no logic: gestures live in models/handGesture.js).
// MediaPipe's hand landmarker (WASM + a local model in assets/hands/) is only loaded the first time it
// is turned on. The camera is opened for video only and released when it is turned off.
const MODEL_URL = new URL('../assets/hands/hand_landmarker.task', import.meta.url).href;
const FRAME_MS = 33; // ~30 detections per second at most, whatever the camera's rate

let landmarkerPromise = null;
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    // The WASM files sit next to the bundle (node_modules in the app, vendor/ in the web build)
    const wasm = new URL('./wasm', import.meta.resolve('@mediapipe/tasks-vision')).href;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numHands: 1 });
    return HandLandmarker.createFromOptions(fileset, options('GPU'))
      .catch(() => HandLandmarker.createFromOptions(fileset, options('CPU')));
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; }); // a failed load can be retried
  return landmarkerPromise;
}

export function createHandTrackingService() {
  // The camera image, for the small preview (the view mirrors it)
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  let stream = null;
  let run = 0;
  let frameRequest = null;

  function stopCamera() {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    frameRequest = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  return {
    video,

    // onHand(landmarks | null) for every analysed frame. Rejects with the camera's DOMException
    // (NotAllowedError, NotFoundError…) or a loading error.
    async start(onHand) {
      const mine = ++run;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (mine !== run) { camera.getTracks().forEach((track) => track.stop()); return; }
      stream = camera;
      video.srcObject = camera;
      await video.play();
      const landmarker = await loadLandmarker();
      if (mine !== run) return;

      let last = 0;
      const tick = (now) => {
        if (mine !== run) return;
        frameRequest = requestAnimationFrame(tick);
        if (now - last < FRAME_MS || video.readyState < 2) return;
        last = now;
        const result = landmarker.detectForVideo(video, now);
        onHand(result.landmarks?.[0] ?? null);
      };
      frameRequest = requestAnimationFrame(tick);
    },

    stop() {
      run++;
      stopCamera();
    },
  };
}

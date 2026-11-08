export interface AudioRecorder {
  /** Finish and resolve the clip. Safe to call more than once: every call
   *  gets the same clip. Always settles: a recorder that already stopped on
   *  its own (the mic went away mid-recording) hands over what it caught, and
   *  one that never reports back is given `STOP_GRACE_MS`. */
  stop: () => Promise<Blob>;
  /** The live mic stream, for a level meter. Analyse this rather than opening
   *  the mic a second time. */
  stream: MediaStream;
}

const MIME = "audio/webm";

/** How long stop() waits for the recorder's last chunk before settling with
 *  what it has. */
export const STOP_GRACE_MS = 2_000;

/** Start recording from the mic; resolve a handle whose stop() yields the Blob. */
export async function startAudioRecording(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const chunks: BlobPart[] = [];

  // Handled from the start, not only from stop(): a recorder whose track ends
  // (a Bluetooth headset dropping out) stops itself, fires `stop` once, and
  // ignores a later stop() call. Waiting for that event in stop() would wait
  // forever.
  let settle: () => void = () => {};
  let grace: ReturnType<typeof setTimeout> | undefined;
  const clip = new Promise<Blob>((resolve) => {
    let done = false;
    settle = () => {
      if (done) return;
      done = true;
      clearTimeout(grace);
      release();
      resolve(new Blob(chunks, { type: MIME }));
    };
  });

  let rec: MediaRecorder;
  try {
    const supported = MediaRecorder.isTypeSupported(MIME);
    rec = new MediaRecorder(stream, supported ? { mimeType: MIME } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = settle;
    rec.onerror = settle;
    rec.start();
  } catch (err) {
    // The mic is open but nothing will ever record it: let it go, or the
    // browser's recording indicator stays on until the page closes.
    release();
    throw err;
  }

  let stopping = false;
  return {
    stream,
    stop: () => {
      if (!stopping) {
        stopping = true;
        if (rec.state !== "inactive") rec.stop();
        // The `stop` event normally follows within a frame; don't let one
        // that never comes hold up the upload.
        grace = setTimeout(settle, STOP_GRACE_MS);
      }
      return clip;
    },
  };
}

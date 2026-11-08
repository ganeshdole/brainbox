export interface AudioRecorder {
  /** Finish and resolve the clip. Safe to call more than once: every call
   *  gets the same clip, since a MediaRecorder only stops once. */
  stop: () => Promise<Blob>;
  /** The live mic stream, for a level meter. Analyse this rather than opening
   *  the mic a second time. */
  stream: MediaStream;
}

const MIME = "audio/webm";

/** Start recording from the mic; resolve a handle whose stop() yields the Blob. */
export async function startAudioRecording(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  let rec: MediaRecorder;
  const chunks: BlobPart[] = [];
  try {
    const supported = MediaRecorder.isTypeSupported(MIME);
    rec = new MediaRecorder(stream, supported ? { mimeType: MIME } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.start();
  } catch (err) {
    // The mic is open but nothing will ever record it: let it go, or the
    // browser's recording indicator stays on until the page closes.
    release();
    throw err;
  }

  let stopped: Promise<Blob> | null = null;
  return {
    stream,
    stop: () => {
      stopped ??= new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: MIME }));
        };
        rec.stop();
      });
      return stopped;
    },
  };
}

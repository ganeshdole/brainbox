export interface AudioRecorder {
  stop: () => Promise<Blob>;
  /** The live mic stream, for a level meter. Analyse this rather than opening
   *  the mic a second time. */
  stream: MediaStream;
}

const MIME = "audio/webm";

/** Start recording from the mic; resolve a handle whose stop() yields the Blob. */
export async function startAudioRecording(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const supported = MediaRecorder.isTypeSupported(MIME);
  const rec = new MediaRecorder(stream, supported ? { mimeType: MIME } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();

  return {
    stream,
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: MIME }));
        };
        rec.stop();
      }),
  };
}

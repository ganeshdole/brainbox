import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { startAudioRecording, type AudioRecorder } from "@brainbox/core";
import { downsample, peakLevel } from "../lib/multiband.ts";
import { useMultibandVolume } from "../lib/use-multiband.ts";
import { fmtDuration } from "../lib/time.ts";
import { BarRow } from "./BarVisualizer.tsx";

/** Bars in the meter. More, thinner bars read as a waveform; a couple of dozen
 *  fat ones read as a row of pills. */
const BARS = 32;
/** Hard cap so a forgotten recording can't grow unbounded. */
const MAX_SECS = 120;

type Phase = "idle" | "recording" | "recorded";

/** Voice capture as the primary way to file a report: one big mic target, bars
 *  that track the speaker's voice per frequency band, and playback before
 *  sending - people won't submit audio they can't hear back. */
export function VoiceNote({ onChange }: { onChange: (b: Blob | null) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [envelope, setEnvelope] = useState<number[]>([]);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const [clipUrl, setClipUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const recRef = useRef<AudioRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Banked in a ref, not state: this accumulates ~30x a second and is only ever
   *  read once, when recording stops. */
  const envelopeRef = useRef<number[]>([]);

  // Live bands drive the bars while recording.
  const bands = useMultibandVolume(phase === "recording" ? stream : null, { bands: BARS });

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setStream(null);
    try {
      const blob = await rec.stop();
      setEnvelope(envelopeRef.current);
      setClipUrl(URL.createObjectURL(blob));
      setPhase("recorded");
      onChange(blob);
    } catch {
      setErr("Recording failed - try again");
      setPhase("idle");
    }
  }, [onChange]);

  const start = async () => {
    setErr("");
    try {
      const rec = await startAudioRecording();
      recRef.current = rec;
      envelopeRef.current = [];
      setStream(rec.stream);
      setEnvelope([]);
      setSecs(0);
      setPlayed(0);
      setPhase("recording");
    } catch {
      setErr("Mic blocked - allow microphone access, or type instead");
    }
  };

  const discard = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setPlayed(0);
    setClipUrl("");
    envelopeRef.current = [];
    setEnvelope([]);
    setSecs(0);
    setPhase("idle");
    onChange(null);
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setErr("Playback unavailable"));
    else el.pause();
  };

  // Bank each band update into the envelope history. Ref-only, so a talking user
  // doesn't trigger a second render per frame on top of the meter's own.
  useEffect(() => {
    if (phase !== "recording") return;
    envelopeRef.current.push(peakLevel(bands));
  }, [bands, phase]);

  // Elapsed clock, plus the runaway-recording cap.
  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecs(elapsed);
      if (elapsed >= MAX_SECS) void stop();
    }, 250);
    return () => clearInterval(id);
  }, [phase, stop]);

  // Revokes the previous clip when it's replaced, and the last one on unmount.
  useEffect(() => {
    if (!clipUrl) return;
    return () => URL.revokeObjectURL(clipUrl);
  }, [clipUrl]);

  // An abandoned recording must release the mic.
  useEffect(
    () => () => {
      const rec = recRef.current;
      recRef.current = null;
      if (rec) void rec.stop().catch(() => {});
    },
    [],
  );

  const recorded = phase === "recorded";
  const label = recorded ? (playing ? "Pause" : "Play voice note") : "Record a voice note";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button
        onClick={phase === "recording" ? () => void stop() : recorded ? togglePlay : start}
        aria-label={phase === "recording" ? "Stop recording" : label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          phase === "recording"
            ? "bg-error text-error ring-2 ring-error"
            : "bg-brand text-on-brand shadow-button hover:bg-brand-hover"
        }`}
      >
        {phase === "recording" ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : recorded ? (
          playing ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {phase === "idle" ? (
        // Verb + object, and no gesture verb: "Tap" is wrong on desktop and the
        // mic icon already carries the interaction. Mirrors the textarea's
        // "Describe what went wrong" so both inputs ask for the same thing. A
        // mic failure takes the label's place rather than adding a second line.
        <span className="min-w-0 flex-1 truncate text-left text-sm">
          {err ? (
            <span className="text-error">{err}</span>
          ) : (
            <span className="text-emphasis">Say what went wrong</span>
          )}
        </span>
      ) : (
        <>
          <BarRow
            levels={recorded ? downsample(envelope, BARS) : bands}
            dimFrom={recorded && playing ? Math.round(played * BARS) : undefined}
          />
          <span className="shrink-0 font-mono text-xs text-default">{fmtDuration(secs)}</span>
        </>
      )}

      {recorded && (
        <button
          onClick={discard}
          aria-label="Delete voice note"
          className="shrink-0 text-muted hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {phase !== "idle" && err && <span className="shrink-0 text-xs text-error">{err}</span>}

      {clipUrl && (
        <audio
          ref={audioRef}
          src={clipUrl}
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPlayed(0);
          }}
          onTimeUpdate={(e) => {
            // MediaRecorder webm often reports duration as Infinity, so scrub
            // against the length we measured while recording.
            const el = e.currentTarget;
            if (secs > 0) setPlayed(Math.min(1, el.currentTime / secs));
          }}
        />
      )}
    </div>
  );
}

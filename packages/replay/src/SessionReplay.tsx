import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { Replayer } from "@rrweb/replay";

import { formatClock } from "./format.ts";
import { parseSessionPayload } from "./session.ts";

type ReplayerEvents = ConstructorParameters<typeof Replayer>[0];

// The mic starts `offsetMs` into the session (permission-prompt lag), so the
// voice track's zero sits at replay time `offsetMs`. Called every frame while
// playing: starts/stops the audio at its window edges and corrects drift.
function syncVoice(a: HTMLAudioElement | null, replayMs: number, offsetMs: number): void {
  if (!a) return;
  const at = (replayMs - offsetMs) / 1000;
  const dur = Number.isFinite(a.duration) ? a.duration : Infinity;
  if (at >= 0 && at < dur) {
    if (a.paused) {
      a.currentTime = at;
      void a.play().catch(() => {
        /* autoplay blocked - replay continues silently */
      });
    } else if (Math.abs(a.currentTime - at) > 0.4) {
      a.currentTime = at;
    }
  } else if (!a.paused) {
    a.pause();
  }
}

/** Gzipped logs are named `.gz`; the check reads the path so a presigned URL's
 *  query string does not hide the extension. */
function isGzipUrl(url: string): boolean {
  try {
    return new URL(url, "http://localhost").pathname.endsWith(".gz");
  } catch {
    return url.endsWith(".gz");
  }
}

export interface SessionReplayProps {
  /** The rrweb log the widget uploaded as the `session` part. */
  url: string;
  /** The voice track, if the recording had one. */
  audioUrl?: string;
  /** The recorded viewport, from the report's metadata. */
  vw: number;
  vh: number;
  /** Passed to `fetch` for the log. Use "include" when the file sits behind
   *  a session cookie. */
  credentials?: RequestCredentials;
  className?: string;
}

// rrweb-player's shipped dist is broken (its Player never constructs a Replayer),
// so we drive @rrweb/replay directly with our own play/seek controls.
export function SessionReplay({
  url,
  audioUrl,
  vw,
  vh,
  credentials = "same-origin",
  className,
}: SessionReplayProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioOffsetRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const el = frameRef.current;
    if (!el) return;

    // fit the frame to the recorded viewport's aspect ratio
    const width = el.clientWidth || 640;
    el.style.height = `${Math.min(560, Math.max(240, Math.round(width * (vh / Math.max(vw, 1)))))}px`;

    (async () => {
      try {
        const res = await fetch(url, { credentials });
        if (!res.ok) throw new Error(`Session fetch failed (${res.status})`);
        const buf = await res.arrayBuffer();
        let text: string;
        if (isGzipUrl(url) && typeof DecompressionStream !== "undefined") {
          const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
          text = await new Response(ds).text();
        } else {
          text = new TextDecoder().decode(buf);
        }
        const { events, audioOffsetMs } = parseSessionPayload(text);
        audioOffsetRef.current = audioOffsetMs;
        if (cancelled) return;
        if (events.length < 2) {
          setError("Recording too short to replay");
          return;
        }

        const { Replayer: ReplayerCtor } = await import("@rrweb/replay");
        if (cancelled) return;
        const replayer = new ReplayerCtor(events as ReplayerEvents, {
          root: el,
          // fast-forwarding idle stretches would run ahead of the voice track
          skipInactive: !audioUrl,
          showWarning: false,
        });
        replayerRef.current = replayer;
        setTotal(replayer.getMetaData().totalTime);
        replayer.pause(0); // render the first frame

        const applyScale = () => {
          const { wrapper, iframe } = replayer;
          const fw = iframe.offsetWidth || vw;
          const fh = iframe.offsetHeight || vh;
          const scale = Math.min(
            el.clientWidth / Math.max(fw, 1),
            el.clientHeight / Math.max(fh, 1),
          );
          wrapper.style.position = "absolute";
          wrapper.style.left = "50%";
          wrapper.style.top = "50%";
          wrapper.style.transformOrigin = "0 0";
          wrapper.style.transform = `scale(${scale}) translate(-50%, -50%)`;
        };
        applyScale();
        replayer.on("resize", applyScale);
        replayer.on("finish", () => setPlaying(false));
        window.addEventListener("resize", applyScale);
        cleanup = () => window.removeEventListener("resize", applyScale);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load recording");
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      try {
        replayerRef.current?.pause();
      } catch {
        /* replayer may never have initialized */
      }
      replayerRef.current = null;
      el.innerHTML = "";
      setPlaying(false);
      setTime(0);
    };
  }, [url, audioUrl, vw, vh, credentials]);

  // progress clock while playing; keeps the voice track glued to the replay
  useEffect(() => {
    if (!playing) return;
    const voice = audioRef.current;
    let raf = 0;
    const tick = () => {
      const r = replayerRef.current;
      if (r) {
        const t = Math.min(r.getCurrentTime(), r.getMetaData().totalTime);
        setTime(t);
        syncVoice(voice, t, audioOffsetRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      voice?.pause();
    };
  }, [playing]);

  const toggle = useCallback(() => {
    const r = replayerRef.current;
    if (!r) return;
    if (playing) {
      r.pause();
      setTime(r.getCurrentTime());
      setPlaying(false);
    } else {
      r.play(time >= total ? 0 : time);
      setPlaying(true);
    }
  }, [playing, time, total]);

  const seek = useCallback(
    (ms: number) => {
      const r = replayerRef.current;
      if (!r) return;
      setTime(ms);
      if (playing) r.play(ms);
      else r.pause(ms);
    },
    [playing],
  );

  const classes = className ? `bb-replay ${className}` : "bb-replay";

  if (error) {
    return <p className="bb-replay__error">{error}</p>;
  }

  return (
    <div className={classes}>
      <div ref={frameRef} className="bb-replay__frame" />
      <div className="bb-replay__bar">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="bb-replay__btn bb-replay__btn--primary"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          value={Math.min(time, total)}
          onChange={(e) => seek(Number(e.target.value))}
          className="bb-replay__range"
        />
        <span className="bb-replay__clock">
          {formatClock(time)} / {formatClock(total)}
        </span>
        {audioUrl && (
          <>
            <button
              type="button"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (audioRef.current) audioRef.current.muted = next;
              }}
              aria-label={muted ? "Unmute voice" : "Mute voice"}
              className="bb-replay__btn"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <audio ref={audioRef} src={audioUrl} preload="auto" muted={muted}>
              <track kind="captions" />
            </audio>
          </>
        )}
      </div>
    </div>
  );
}

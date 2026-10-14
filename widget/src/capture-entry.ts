import { record } from "rrweb";
import { domToCanvas } from "modern-screenshot";
import { CAPTURE_GLOBAL, type CaptureLibs } from "./lib/load-capture.ts";

// `widget-capture.js`: the capture libraries for the script-tag bundle, kept out
// of `widget.js` so a page view that never files a report never downloads or
// parses them. `lib/load-capture.ts` injects this file and reads the global.

const libs: CaptureLibs = { record, domToCanvas };
(window as unknown as Record<string, CaptureLibs>)[CAPTURE_GLOBAL] = libs;

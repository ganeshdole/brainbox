# Sounds

| File | What it marks | Source |
|---|---|---|
| `bed.mp3` | the music bed, a 20 s seamless loop; Remotion loops it and `bedVolume()` fades and ducks it | ElevenLabs sound generation (`loop: true`), normalised to -16 LUFS |
| `notify.mp3` | each notification in the hook | ElevenLabs sound generation |
| `impact.mp3` | the hook headline landing | ElevenLabs sound generation |
| `pop.mp3` | the issue closing | Kenney "Interface Sounds" `pluck_001`, CC0 |
| `click.mp3` | every press | Kenney `click_003`, CC0 |
| `open.mp3` | a widget panel opening | Kenney `open_001`, CC0 |
| `mark.mp3` | the box finishing | Kenney `drop_002`, CC0 |
| `tick.mp3` | each ticket block, destination screen, delivered mark and terminal line landing | Kenney `tick_002`, CC0 |
| `land.mp3` | the ticket title and the pull request appearing | Kenney `confirmation_002`, CC0 |
| `whoosh.mp3` | both whips (to GitHub, to the terminal) | synthesised with ffmpeg (pink noise, bandpass, fades) |
| `voice.mp3` | the end-user's voice note | ElevenLabs, premade voice "Alice", model `eleven_v3` |

Kenney's pack is public domain (CC0 1.0): https://kenney.nl/assets/interface-sounds.
The whoosh is ours.

The Reels (`src/reels/`) use the effects but not the bed or the voice; music
for them is added in Instagram. They do use `notify.mp3` and `impact.mp3`.

The voice line, the bed, the notification and the impact were generated on a
free ElevenLabs plan, which permits non-commercial use with attribution only.
Before the film is published, regenerate them on a paid plan, or replace the
bed with a licensed track and record a person saying the line. The spoken
words must stay identical to `TRANSCRIPT` in `src/ui/GithubIssue.tsx`:

> Hey, so I hit Pay now and nothing happens? I tried it twice. Same thing.

To swap the take: drop the new file in as `voice.mp3`, then set the recording
window in `src/timeline.ts` (`CLICKS.micStop` minus `AUDIO.voice`) to at least
its length, and the `Sequence` duration for the voice in `src/Launch.tsx` to
match. Other candidate takes rendered during production live in
`out/voice-candidates/` (not committed).

Other bed and effect candidates rendered during production live in
`out/music-candidates/` and `out/sfx-candidates/` (not committed). The bed was
chosen by loudness profile (the quietest, most even of three); nobody has
listened to it yet, so audition it first.

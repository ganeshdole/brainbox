# The launch film: story

This is the narrative the film in this package is built from. The timeline in
`src/timeline.ts` is this story as frame numbers. Change the story here first,
then the numbers.

## Who it is for, and what it has to do

The viewer is a SaaS founder or the engineer who gets the bug reports. They are
scrolling. The film has about three seconds to be recognisable, ten to pay that
recognition off, and under a minute to leave one sentence behind:
*users talk, Brainbox writes the ticket.*

Three findings shaped the structure:

- **Earn the first ten seconds.** Wistia's engagement data: a sharp early drop
  means the hook is not landing or the video takes too long to deliver on it.
  Cutting a minute of set-up so the content started inside ten seconds halved
  the early loss. So: no logo, no title card, the pain on frame one.
- **The viewer is the hero, the product is the guide.** StoryBrand's rule.
  The founder has a problem (reports with nothing in them), meets a guide
  (Brainbox), gets a plan (tap, circle, talk), and wins (a fix shipped).
  The film is shot from their side of the screen.
- **Show the real product doing the real thing.** Linear's launch films, and
  Lago's write-up of copying them: no voiceover, no stock, no abstract shapes.
  The camera moves through the product one action at a time. Sandwich Video's
  version of the same rule: the product is a character with a journey, and the
  job is clarity, not cleverness.

## The spine

Kenn Adams' story spine, the eight-line improv tool Pixar's writers use, with
one line per act:

| Spine | Act | What is on screen |
|---|---|---|
| Once upon a time… | 0 Hook | A founder at their editor, mid-work. |
| Every day… | 0 Hook | Messages stack up: "hey the checkout is broken", "it just does nothing??", "can u fix asap". *That's the whole bug report.* |
| Until one day… | 1 Checkout | Maya hits Pay now. Nothing. Twice. But this app has a Brainbox button. |
| Because of that… | 2 Widget | She taps it, draws a box round the button, and says what happened. Ten seconds of her time. |
| Because of that… | 3 Ticket | A GitHub issue writes itself: the screen with her mark on it, her words, the browser, the two console errors. Nothing left to ask her. |
| Because of that… | 4 Destinations | The same report is already in Linear, in #bugs on Slack, in the inbox. Where the team already works. |
| Until finally… | 5 Agent | An agent reads the ticket, finds line 42 of `pay.ts`, ships the fix, closes the issue. |
| And ever since then… | 6 End | Users talk. Brainbox writes the ticket. Works with GitHub, Linear, Slack, Gmail, Claude Code. |

Two bookends hold it together. The hook opens on `src/checkout/pay.ts` in the
founder's editor; the agent act ends by editing line 42 of the same file. The
founder never types in between. That is the promise.

## The beats, with their job

| Time | Beat | Job | On-screen line |
|---|---|---|---|
| 0.0 | Three Slack notifications slide in over a dim code editor, half a second apart. | Recognition. Every founder has this thread. Motion from frame one. | (the messages) |
| 1.6 | Headline punches in with a low hit. | Name the pain in six words. | That's the whole bug report. |
| 2.1 | Mono subline. | Make the gap explicit. | No screenshot. No steps. No errors. |
| 2.6 | Push-through: the hook blurs and grows, the checkout settles in. | Turn: from the founder's screen to the user's. | Here's what actually happened. |
| 3.2 | Pay now pressed. Nothing. Pressed again. | Stakes: it is a real bug, and a paying one. | |
| 5.6 | The Brainbox button pulses once; she taps; the chooser opens. | The guide appears. One tap, no form. | Your user taps once. |
| 8.0 | Page freezes, box drawn round the button, Next. | The plan, step one. Marks stay vector till the end. | Circles what broke. |
| 11.0 | Composer opens, mic goes live, she talks, Send. | The plan, step two. Her voice, not a form. | Talks. |
| 18.4 | Whip to GitHub. Title, image, transcript, table, errors, footer land in order. | The payoff, in the order `renderTicket()` writes it. | A ticket. Not a complaint. |
| 23.1 | Everything in one frame. | Make the completeness explicit. | Screen, words, browser, errors. Attached, every time. |
| 26.4 | Camera pushes into the console errors; the rest falls back. | The one detail an engineer cares about most. | Nothing left to ask the user. |
| 29.2 | Linear issue, Slack message, Gmail row, each full-frame, native, 1.8 s. Then the four marks with green ticks. | Show, don't diagram: the report as each tool shows it. | Lands where your team works. |
| 36.4 | Whip to a terminal. Claude Code reads #482, finds the line, edits, tests, opens the PR. The PR card lands; #482 flips to Closed. | The future. The ticket had everything an agent needs. | Then your agent takes it from here. / From a tap to a fix. |
| 46.6 | Wordmark, line, five marks, URL. | Leave the sentence behind. | Users talk. Brainbox writes the ticket. |

## Rules the film keeps

- **Silent-first.** It is understood on mute. Every caption is burned in.
- **No logo until the end.** The first frame is the viewer's problem.
- **One idea per beat, one motion at a time.** Pattern interrupt every eight
  to ten seconds: light UI, dark UI, type, terminal.
- **Real pixels.** The widget is drawn from the real components; the ticket
  follows the real renderer; the destinations are the tools as they look.
  Abstract diagrams were tried and cut: they read as a flowchart, not a film.
- **The camera does the transitions.** Push in, whip, push through. No cuts
  to black until the end.
- **Sound confirms, never narrates.** One sound per motion, the end-user's
  voice as the only voice, a quiet bed that ducks under her.

## Sources

- Wistia, "What your video engagement graph is telling you":
  https://wistia.com/learn/marketing/engagement-graph-learnings
- Donald Miller, *Building a StoryBrand* (2017): the customer is the hero.
- Kenn Adams' story spine: https://www.tckpublishing.com/story-spine/
- Lago, "We killed our motion design job" (copying Linear's launch films):
  https://getlago.com/blog/we-killed-our-motion-design-job
- Sandwich Video / Adam Lisagor on clarity and the product as a character:
  https://techcrunch.com/2015/08/18/sandwichs-adam-lisagor-on-producing-the-killer-corporate-video/
- Motion the Agency, sound design before and after:
  https://www.motiontheagency.com/blog/sound-design-examples-before-after-in-motion

## The Reels

The Reels are not the film cut down. They are built for a feed someone is
thumbing through on a phone, from what Instagram ranks: watch time, likes, and
above all sends (a Reel forwarded in a DM reaches people who don't follow
you). So each one is a thing an engineer forwards to a teammate with "this is
us", short enough to watch twice.

- **Reel 1, "That's the whole bug report."** The film's hook, on its own, then
  the payoff at phone size: the same bug through the widget on a phone, and
  the ticket. 15 s.
- **Reel 2, "What they sent vs what you needed."** One line alone in the
  frame, long enough to wince at; then the ticket for the same bug builds
  under it. 10 s. It is a series: each episode is a different line every
  founder has had ("the export button is gone??", "it doesn't work on my
  phone").

Rules on top of the film's: everything that matters sits in Instagram's safe
area; nothing on screen smaller than about 20 px on the 1080-wide frame;
first motion by the third frame; the point made inside two seconds; end on
black so the loop is seamless. Music is added in Instagram, not here: a
business account gets Meta's Sound Collection, and a Reel with licensed music
can't be boosted as an ad.

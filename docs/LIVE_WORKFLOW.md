# Live coaching and replay mechanics

Implementation details for the current public live mode. For the product overview
and setup, see the [README](../README.md).

**Live exercise:** choose any of the four exercises, then start the camera for a mirrored preview, local body tracking,
an updating correction list, and automatic spoken guidance. The coach speaks
specific good-form feedback, corrections, and next-rep reminders; users do not need to speak back, and no microphone is captured.
Mute coach silences output. Tracking targets 12–15 updates per second. Starting
about 1.2 seconds after camera readiness, the app checks for a free analysis slot
every second and sends up to four ordered frames spanning the latest three
seconds. Squat and leg-extension review also retain up to four actual moments
around the latest tracked approach, furthest movement and return from an
eight-second local buffer, so the turnaround remains available after the rep.
Squat timing includes hip lowering relative to the feet for frontal views where
projected knee angles barely change. The provider still assesses depth from the
actual images; praise for other aspects distinguishes unconfirmed squat depth. A dedicated live prompt contains only the
relevant assessment rules.
One visual request runs at a time with a 45-second provider recovery ceiling and
five additional seconds for transport; successful requests return immediately. Timeouts automatically give way to a fresh
movement check; rate/quota errors are reported separately. Live responses use
a compact checklist, expanded into the same evidence-validated report contract.
The coach introduces itself when connected, then speaks as soon as useful
analysis is ready. Automatic cues have a three-second minimum interval and a
six-second cooldown per criterion. New corrections take priority; specific
reassurance alternates with repeat next-rep nudges. Positive feedback remains
eligible for twelve seconds from its cited evidence, new corrections for fifteen
seconds, and educational reminders for twenty seconds. Unclear checks never
become praise, and older positive evidence cannot overwrite a newer mistake.
Feedback describes the reviewed rep, never an assurance about the current pose.
Completed assessments always appear, including unclear or delayed results.
Older results can be announced once as a review of an earlier rep; current cue
freshness limits still apply. Unclear results explain the assessment limitation.
Each selected update includes its actual text in an explicit speech instruction;
a matching provider acknowledgment triggers a follow-up delivery prompt if
speech has not started. Only detected remote audio marks an introduction started.
Once admitted, speech can finish without an evidence-age mute timer. Only one
cue waits for audio at a time; a twelve-second recovery timeout reports a silent
provider stall and permits another update. Real audio arrival clears that notice.
The live reference is an authored four-second loop at a fixed camera angle,
independent of tracking; the body map continues to follow the camera.
Camera and mapping can continue if AI or voice fails. These settings remove
application waits; they are not measured end-to-end latency guarantees.

**After live exercise:** End session stops capture and voice and opens silent
review of up to ten seconds ending at the last detected rep, plus up to five
distinct correction clips. That exercise window stays retained while you walk
over to end the session. Rep timing uses the local body tracker; if it cannot
identify a rep, review labels the fallback as a recent session recording.
Correction clips open around their cited evidence. Evidence seeks convert the
analysis-window timestamp into absolute session time, then into the cropped
recording offset. Exact assessed images are also retained for comparison. Independently recorded segments
form a logical replay timeline, using a format the browser can both record and
play. Recordings contain video only and remain in memory until reset, a new live
session, or leaving the page. There is no cloud recording storage.

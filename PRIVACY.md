# Privacy

Task Colors for Claude processes open browser tab titles, URLs, and native group metadata to display and organize your work. The workspace supports HTTP/HTTPS websites, including Claude, other AI tools, and research pages. It does not extract page bodies, message text, editor values, or past browsing history. Version 1.2 adds an optional Claude-only activity listener described below.

## Data stored on your device

- Task names, custom colors, native browser colors, Claude title keywords, theme, and automation preference are stored in Chrome's local extension storage.
- Only when you choose **Save**, the extension stores that task's current URLs and page titles in a saved collection. Collections persist across browser restarts, up to 50 collections of 200 links each. URLs can include sensitive query parameters, so save only collections you want retained locally.
- Focus mode stores native group IDs and prior collapsed states in session storage. This temporary information clears on browser restart.

There is no remote analytics, advertising, backend, remote font, remote script, or developer-operated data transfer. Optional Insights are local measurements only. The extension does not synchronize collections to an external account. Opening or restoring a URL navigates to that website normally; the website's own privacy policy applies.

## Permissions

`tabs` reads open-tab titles and URLs across websites. It does not provide this extension with the history API, cookies, or page-content access. `tabGroups` manages native groups. `storage` keeps preferences and explicitly saved collections. The `idle` permission distinguishes device input inactivity and screen lock. A top-frame content script matches only `https://claude.ai/*`; this entails access to Claude pages. It recognizes editor/send-control structure and event timing without reading editor values or page/message text. No scripting permission is requested. Local storage is restricted to trusted extension contexts; the content script receives only its minimal measurement configuration through a validated message route.

## Deletion

Use **Remove** on the Saved shelf to delete an individual saved collection. Deleting a task ungroups its tabs but leaves separately saved collections available. Uninstalling removes local extension settings and collections. Native groups and open tabs are managed by Chrome and may remain after uninstalling.

Chrome's own browser/account synchronization and the privacy policies of visited websites are independent of this extension.

## Optional local Insights

Tracking is off by default. When enabled, the Claude listener sends only a coarse activity mode and a send-attempt boolean to the local extension worker. It observes the occurrence of trusted input events, never typed character values or prompt content. Send detection is heuristic and does not confirm submission success.

The worker records daily durations (composing, viewing/interaction, quiet viewing, organizer), send-attempt counts, chat-tab-switch counts, and task-ID duration totals. Insights do not store chat titles, URLs, prompt text, response text, a keystroke log, or a chronological browsing log. Temporary timing checkpoints and tab IDs are held in session storage and cleared on browser restart. The focus timer stores only its duration and deadline.

Only foreground, non-private Claude/organizer activity is eligible. Locked screens and long unobserved gaps are excluded; device input inactivity is labelled quiet time and is not interpreted as distracted or unproductive behavior. Timings and send-attempt counts are approximate.

Turn off **Measure locally** to pause. **Clear statistics** removes the aggregate history and its current timing checkpoint while leaving task/collection data intact. Existing statistics are otherwise retained for a rolling 30-day window, pruned when sampling or opening/refreshing Insights next occurs. No data leaves the device except ordinary navigation to links you open.

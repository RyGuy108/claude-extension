# Privacy

Task Colors for Claude processes open browser tab titles, URLs, and native group metadata to display and organize your work. Version 1.1 supports HTTP/HTTPS websites, including Claude, other AI tools, and research pages. It does not read page bodies, messages, forms, or past browsing history.

## Data stored on your device

- Task names, custom colors, native browser colors, Claude title keywords, theme, and automation preference are stored in Chrome's local extension storage.
- Only when you choose **Save**, the extension stores that task's current URLs and page titles in a saved collection. Collections persist across browser restarts, up to 50 collections of 200 links each. URLs can include sensitive query parameters, so save only collections you want retained locally.
- Focus mode stores native group IDs and prior collapsed states in session storage. This temporary information clears on browser restart.

There is no analytics, telemetry, advertising, backend, remote font, remote script, or developer-operated data transfer. The extension does not synchronize collections to an external account. Opening or restoring a URL navigates to that website normally; the website's own privacy policy applies.

## Permissions

`tabs` reads open-tab titles and URLs across websites. It does not provide this extension with the history API, cookies, or page-content access. `tabGroups` manages native groups. `storage` keeps preferences and explicitly saved collections. No host permissions, content scripts, or scripting permission are requested.

## Deletion

Use **Remove** on the Saved shelf to delete an individual saved collection. Deleting a task ungroups its tabs but leaves separately saved collections available. Uninstalling removes local extension settings and collections. Native groups and open tabs are managed by Chrome and may remain after uninstalling.

Chrome's own browser/account synchronization and the privacy policies of visited websites are independent of this extension.

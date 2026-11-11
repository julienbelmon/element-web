<!--
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
-->

# Nickname-colour implementation checklist

This is an ordered, implementation-ready plan for the browser-only feature described in [Custom nickname colours](./nickname-colors.md). Each task should be one small reviewable change where practical. No task authorises Element Desktop work.

## MVP definition

The MVP is complete when a signed-in Element Web user on a supporting homeserver can choose a WCAG-approved palette colour or reset to default in **Settings → Profile**; Element stores/removes `eu.zhln.nickname_color` using the Matrix JS SDK extended-profile API; and valid values render safely with responsive updates in timeline sender names, member lists, profile/right panel and rendered mention pills. Unsupported/malformed/error cases fall back without breaking normal name rendering. Federation has been tested and its observed limitation documented; it is not a launch-blocking guarantee of instant propagation.

## Ordered work items

### 0. Establish protocol and deployment baseline

- **Depends on:** none.
- **Files/areas:** live `matrix.zhln.eu`, one separate federated Synapse test server, SDK snapshot in `apps/web/package.json`/lockfile; no application edits.
- **Work:**
  1. Record `/_matrix/client/versions`, extended-profile support result, and capabilities response for `matrix.zhln.eu`.
  2. Exercise SDK-equivalent GET/PUT/DELETE for `eu.zhln.nickname_color`, including unset (`M_NOT_FOUND`), invalid key/value, denied write, and delete.
  3. In a two-server federation test, set a zhln user value and read it from a remote user's client/homeserver. Change and delete it; record whether read-through works and whether `UserProfileUpdate` arrives remotely.
  4. Confirm `msc4133_enabled`/any profile-field policy and reverse-proxy authentication/rate-limit configuration on the homeserver. Do not change Synapse merely to start the Web work.
- **Acceptance criteria:** an evidence note states exact server versions/config switches, response shapes/error codes, federation result, and whether the feature key is permitted. Unknowns are explicit.

### 1. Add pure nickname-colour domain utilities and tests

- **Depends on:** task 0 palette/background decision.
- **New files:** proposed `apps/web/src/utils/nicknameColor.ts` and `nicknameColor.test.ts`.
- **Work:** define the field-key constant, strict canonical parser, fixed accessible palette, contrast calculation and typed safe-style helper. The only accepted persisted syntax is `#rrggbb`; canonicalise to lower case.
- **Tests:** valid lower/upper hex; rejected short/long/alpha/non-string/CSS-function/whitespace inputs; palette uniqueness and contrast against actual light/dark/high-contrast token-derived backgrounds; style helper rejects invalid input.
- **Acceptance criteria:** utility has no React/network dependency, accepts no unsafe CSS, and all palette values meet the agreed contrast rule.

### 2. Implement the dedicated extended-profile cache/store

- **Depends on:** task 1.
- **New files:** proposed `apps/web/src/stores/NicknameColorStore.ts` and `NicknameColorStore.test.ts`.
- **Reference:** `apps/web/src/stores/UserProfilesStore.ts`, `utils/userStatus.ts`.
- **Work:** implement an LRU bounded cache (initially 500), load state, per-user in-flight deduplication, subscribe/unsubscribe API, `getOrFetch`, explicit invalidation, confirmed own set/delete update methods, and `ClientEvent.UserProfileUpdate` handling. Use `doesServerSupportExtendedProfiles`, `getExtendedProfileProperty`, `setExtendedProfileProperty`, and `deleteExtendedProfileProperty`; handle `M_NOT_FOUND` as absent.
- **Tests:** support false; valid/malformed/absent values; no duplicated concurrent GET; successful set/delete; rejected write retains confirmed value; profile event with value; null/omitted profile event invalidates; cache eviction; listener cleanup; no request after disposal.
- **Acceptance criteria:** the store never uses raw HTTP or `setExtendedProfile`, does not rely on membership events, and a value change emits exactly one observable update per state transition.

### 3. Wire store lifecycle into the Web SDK context

- **Depends on:** task 2.
- **Files:** `apps/web/src/contexts/SDKContextClass.ts`, `SDKContextClass.test.ts`.
- **Work:** lazily create the store with the current Matrix client, expose it through a descriptive typed getter, and discard/stop it on logout alongside `userProfilesStore`.
- **Tests:** getter requires a client, returns a stable instance while logged in, and produces a fresh instance after logout without residual listeners.
- **Acceptance criteria:** only browser Web context owns the store; no desktop/module API changes.

### 4. Provide a consumer hook

- **Depends on:** tasks 2–3.
- **New files:** proposed `apps/web/src/hooks/useNicknameColor.ts` and test.
- **Reference:** `apps/web/src/hooks/useUserStatus.ts`.
- **Work:** subscribe to store updates, fetch lazily for a supplied user ID, safely ignore an unmounted result, and return an optional canonical colour plus an optional loading/error state useful to settings. Avoid a fetch for undefined user ID.
- **Tests:** absent ID, initial cached state, fetch/subscribe update, malformed response fallback, unmount before resolution, and event-based refresh.
- **Acceptance criteria:** rendering is non-blocking and repeated mounted consumers do not produce duplicate requests.

### 5. Extend the profile settings UI

- **Depends on:** tasks 1–4.
- **Files:** `apps/web/src/components/views/settings/UserProfileSettings.tsx`, co-located test, Web CSS if needed, i18n source.
- **Work:** add accessible radio palette, Default/reset, preview, support detection, pending/error/success state, and save/delete flows. Follow existing display-name error handling and Toast patterns. Place it in the Profile section without coupling it to `SettingsStore`.
- **Tests:** support unavailable; initial fetched selected value; choosing/saving a swatch calls `setExtendedProfileProperty` with the exact canonical key/value; reset calls delete; loading disables actions; request rejection shows an error and preserves draft/confirmed value; keyboard/radio labels and preview are accessible.
- **Acceptance criteria:** the only write API is a single-field set/delete, no request is made until a user action, and no inaccessible palette choice is selectable.

### 6. Add custom-colour support to the common sender-name rendering path

- **Depends on:** tasks 1–4. May be split into a shared-component contract commit and a Web VM consumer commit.
- **Files:** `apps/web/src/viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel.ts` and test; if necessary, `packages/shared-components/src/room/timeline/event-tile/EventTileView/DisambiguatedProfile/{DisambiguatedProfileView.tsx,*.test.tsx}`.
- **Work:** pass only a validated typed style/custom property to the display-name element. Keep `colorClass` as deterministic fallback. Ensure the View remains dumb and the ViewModel/hook boundary follows existing MVVM rules; do not make every VM independently fetch profiles.
- **Tests:** custom value wins; absent/malformed/error uses hash class or existing default; title/disambiguation/status/click behaviour remains unchanged; shared view cannot accept an unvalidated arbitrary style string.
- **Acceptance criteria:** timeline sender names and existing `RoomMemberTileView` inherit the result, with no regressions to shared-component stories/tests.

### 7. Cover right-panel profiles and rendered mention pills

- **Depends on:** tasks 1–4; task 6 style helper/interface decision.
- **Files:** `apps/web/src/components/views/right_panel/user_info/UserInfoHeaderView.tsx` and test; `apps/web/src/components/views/elements/Pill.tsx` and test; related PCSS only when essential.
- **Work:** fetch/subscribe only for the user being rendered and apply safe colour to the name text—not avatar, MXID, link target or status. Keep the existing pill behaviour and tooltip intact.
- **Tests:** valid colour, fallback, missing ID, profile update rerender, and accessible link/text semantics.
- **Acceptance criteria:** the four MVP surfaces render consistently without altering mention payloads or notification behaviour.

### 8. Integrate translations, formatting, type checks and unit suite

- **Depends on:** tasks 5–7.
- **Files:** generated strings as produced by tooling; no hand-edited unrelated translations.
- **Work:** add user-visible English strings using the repository i18n pattern, run `pnpm i18n`, then formatting/lint/type/unit commands below.
- **Acceptance criteria:** no untranslated literals, no `any` introduced, appropriate TSDoc/copyright headers on new files, and all checks pass.

### 9. Add a focused Web Playwright happy-path test

- **Depends on:** task 8 and test-homeserver support for profile fields.
- **Files:** preferably extend `apps/web/playwright/e2e/timeline/timeline.spec.ts`; otherwise add a narrowly scoped Web e2e spec.
- **Work:** use profile API setup or settings UI to select a palette colour, open a room, assert the colour on a timeline sender and member/profile surface, reset, then assert fallback. Use roles/labels for settings interaction; a narrowly scoped CSS computed-colour assertion is acceptable for visual effect.
- **Acceptance criteria:** test runs under `apps/web` Chrome against the project test infrastructure and does not update screenshots merely to pass.

### 10. Evaluate opt-in sync delivery (post-MVP)

- **Depends on:** measured baseline from task 9 and federation study task 0.
- **Files:** potentially `apps/web/src/MatrixClientPeg.ts`, store tests and sync integration tests.
- **Work:** quantify requests when scrolling a large room. Only if worthwhile and protocol-supported, add `eu.zhln.nickname_color` to `unstableMSC4429SyncUserProfileFields` without removing status fields, and prove changes work after sync/reconnect. Reassess privacy/bandwidth and remote-update behaviour.
- **Acceptance criteria:** a before/after request and sync-payload measurement justifies the change; otherwise record “not enabled” and retain on-demand cache design.

### 11. Broaden rendering coverage (post-MVP, one surface per change)

- **Depends on:** MVP release and performance budget.
- **Candidate areas:** composer autocomplete (`Autocomplete`/completion renderers), read receipts, event summaries, reply/thread previews not using the common profile view, user/Spotlight search, Invite/Forward dialogs, room previews and user menu.
- **Work:** audit each direct display-name rendering, use the common safe hook/helper, and test the surface. Do not bulk-add fetches to virtualised lists without request measurements.
- **Acceptance criteria:** every added surface has fallback and update tests; a maintained audit table tracks remaining intentional exclusions.

## Test and developer workflow

Run commands from the repository root unless noted:

```sh
# Targeted Web unit tests while developing
pnpm vitest run apps/web/src/utils/nicknameColor.test.ts
pnpm vitest run apps/web/src/stores/NicknameColorStore.test.ts
pnpm vitest run apps/web/src/components/views/settings/UserProfileSettings.test.tsx

# Shared component tests only if task 6 changes that workspace
cd packages/shared-components && pnpm test:unit -- src/room/timeline/event-tile/EventTileView/DisambiguatedProfile/DisambiguatedProfile.test.tsx

# Required generation and quality checks
pnpm i18n
pnpm lint:fmt
pnpm lint:js
pnpm -r --workspace-concurrency=1 lint:types
pnpm test:unit

# Browser development and focused e2e
cd apps/web && pnpm start
# in another terminal, from apps/web:
pnpm test:playwright playwright/e2e/timeline/timeline.spec.ts --project=Chrome
```

Follow the repository's existing Playwright guidance: a container runtime is required for the homeserver testcontainers; check for a stale server on port 8080; use role/label locators; tag screenshot tests and review any altered PNG rather than regenerating baselines. New code must have the current-year copyright header and tests must import Vitest APIs explicitly.

## Eventual `element.zhln.eu` deployment runbook

This is a production plan, not an instruction to deploy during implementation.

1. **Build immutable Web artifact.** From the fork revision that passed the checklist, build the browser image from the repository root using `apps/web/Dockerfile` (context must be the monorepo root). Tag with both release/version and immutable commit digest. Pin/record the Matrix SDK lockfile revision used by the build.
2. **Supply deployment configuration, not source edits.** Mount a reviewed host `config.json` at `/app/config.json`; set `default_server_config.m.homeserver.base_url` to `https://matrix.zhln.eu`, server name to `zhln.eu`, and set the room-directory/default configuration deliberately. Keep secrets and environment-specific URLs out of the image/source. Validate JSON and fetch `https://element.zhln.eu/config.json` before traffic cutover.
3. **Run Element container privately.** The image is an unprivileged nginx server; publish it only to loopback/a private Docker network (for example container port 80 to `127.0.0.1:8081`), or attach it to the Caddy network. Use a read-only config mount and restart policy/health check. Do not expose the container directly to the Internet if Caddy terminates TLS.
4. **Configure Caddy at `element.zhln.eu`.** Terminate HTTPS, proxy the Element static site to the container, redirect HTTP to HTTPS, and ensure normal SPA/static serving works. Preserve no-cache/revalidation for `/`, `/index.html`, `/config*.json`, `/version`, and `/i18n/`; assets can remain immutable/cacheable. Set at least `X-Content-Type-Options: nosniff`, clickjacking protection (`frame-ancestors 'self'` CSP and/or `X-Frame-Options: SAMEORIGIN`), and a CSP compatible with Element's actual integrations. Do not casually add a restrictive CSP without browser-console validation.
5. **Keep origins separate.** `element.zhln.eu` is appropriately separate from `matrix.zhln.eu`; do not co-host the app under the homeserver origin. Confirm Synapse CORS and reverse proxy configuration accept the Element origin and that login, media download/upload, SSO (if used), widgets and WebRTC still work.
6. **Pre-production smoke test.** On a staging hostname, test fresh login, registration policy, E2EE, room send/receive, media, settings colour save/reset, invalid/missing fallback, a second browser/device update, and cross-server read. Inspect network requests: expected profile endpoints only, no request storm while scrolling.
7. **Roll out and observe.** Deploy canary/maintenance-window first. Monitor Caddy and Synapse 4xx/5xx/profile rate-limit logs, browser errors and profile request volume. Keep the prior known-good Element image/config ready; rollback is changing the image tag and restarting, not deleting profile data. A stored colour is harmless to old clients and remains ignored by upstream Element.
8. **Post-rollout federation verification.** Repeat the two-homeserver test with production configuration. Document observed stale/missing remote behaviour in support notes rather than promising instant federation.

## Explicit release gates

- [ ] Tasks 0–9 complete and reviewed.
- [ ] No Synapse modification was required; if one is proposed, a concrete failing request/test and separate operational design exist.
- [ ] All supported visual themes meet contrast and keyboard/screen-reader checks.
- [ ] Large-room request-rate measurement meets an agreed budget.
- [ ] Federation behaviour has a reproducible evidence record, including limitations.
- [ ] Browser Web-only diff has no desktop/Electron/package changes.
- [ ] Production config and Caddy configuration have been security-reviewed and rollback tested.

<!--
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
-->

# Custom nickname colours for Element Web

## Purpose and scope

This document designs an optional, global nickname-colour feature for the browser application in `apps/web`. A user chooses one colour in their **Profile** settings. Element Web writes it to the user's Matrix profile under:

```text
eu.zhln.nickname_color
```

Element Web then uses that value wherever it renders that user's display name in the agreed MVP surfaces. The value is global to the Matrix user; it is **not** copied to, or configured per, room.

This is deliberately a Web-only fork feature. Do not change `apps/desktop`, Electron packaging, or desktop documentation. The only anticipated non-`apps/web` changes are a small shared-component contract change if it is needed to carry a safe CSS colour into the existing timeline profile view.

## Evidence, constraints, and open questions

### Verified in this checkout

| Topic | Finding | Evidence |
| --- | --- | --- |
| Web application boundary | The browser application is `apps/web`; its package name is `element-web`. | `apps/web/package.json` |
| SDK source/version | Web depends on the Matrix JS SDK `develop` snapshot pinned in `pnpm-lock.yaml` to `a019c7f…`. | `apps/web/package.json`, `pnpm-lock.yaml` |
| Extended-profile SDK API | The pinned SDK exposes `doesServerSupportExtendedProfiles()`, `getExtendedProfileProperty()`, `setExtendedProfileProperty()`, and `deleteExtendedProfileProperty()`. It selects `/v3` for Matrix v1.16+ or advertised stable support, otherwise the MSC4133 unstable prefix. | SDK `src/client.ts`, methods around lines 7738–7897, inspected at the lockfile commit |
| SDK cache and sync event | `getExtendedProfileProperty()` first checks the SDK stored user profile and writes an HTTP-read value through to that cache. The SDK emits `ClientEvent.UserProfileUpdate` with `(userId, Record<string, unknown> \| null)`. | same SDK source |
| Existing precedent | User status is an MSC4133 consumer. `apps/web/src/utils/userStatus.ts` feature-detects support, validates untrusted data, handles `M_NOT_FOUND`, and uses the property APIs. `apps/web/src/hooks/useUserStatus.ts` refreshes on `UserProfileUpdate`. | those files and their tests |
| Sync opt-in | `MatrixClientPeg` currently requests only `org.matrix.msc4426.status` and `org.matrix.msc4426.call` through `unstableMSC4429SyncUserProfileFields`, and only when status is enabled. | `apps/web/src/MatrixClientPeg.ts` |
| Existing name rendering | Timeline and member-list names already use `DisambiguatedProfileViewModel` in Web and `DisambiguatedProfileView` in `packages/shared-components`. Its `colorClass` currently represents the deterministic six-colour hash (`mx_Username_color1`…`6`). | `apps/web/src/viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel.ts`, `packages/shared-components/src/room/timeline/event-tile/EventTileView/DisambiguatedProfile/DisambiguatedProfileView.tsx` |
| Profile settings home | The profile section is `UserProfileSettings` and is mounted by `AccountUserSettingsTab`. It already saves display name/avatar and has co-located unit tests. | `apps/web/src/components/views/settings/UserProfileSettings.tsx`, `…test.tsx`, `tabs/user/AccountUserSettingsTab.tsx` |
| Profile stores | `OwnProfileStore` is the reactive store for the signed-in profile. `UserProfilesStore` is an LRU (500) cache for legacy `getProfileInfo()` calls and invalidates only when member-event display name/avatar change. | `apps/web/src/stores/OwnProfileStore.ts`, `UserProfilesStore.ts` |
| Legacy profile events | Custom fields are not member-event data. Current room-member resolution supplies only user ID, room ID, display name and disambiguation. | `apps/web/src/hooks/room/useRoomMemberProfile.ts` |
| Deployment assets | The Web Docker image serves built files from `/app`, accepts `/app/config.json`, and listens on `ELEMENT_WEB_PORT`; its embedded nginx disables caching for config/index/i18n/version. | `apps/web/Dockerfile`, `apps/web/docker/nginx-templates/default.conf.template`, `docs/install.md` |

### Verified protocol/server facts

The checked MSC4133 proposal defines public global custom profile fields, field endpoints at `/_matrix/client/v3/profile/{userId}/{key}`, deletion via `DELETE`, namespaced keys, and a 64 KiB complete-profile bound. It explicitly says custom fields do **not** create room member state events. It also says the existing federation profile query mirrors the expanded API, while homeservers may choose which fields to publish.

The source at Synapse tag `v1.164.2` confirms that:

- a namespaced custom field is accepted on the v3 single-field endpoint; Synapse checks a 255-byte key limit and Common Namespaced Identifier Grammar;
- custom values are stored separately from display name/avatar, and custom-field writes do not propagate into rooms or the user directory;
- a local profile lookup returns custom fields; remote lookups use the existing federation `profile` query, including a requested `field` value;
- Synapse deliberately removes MSC4426 status keys for remote profiles because it does not push remote updates in sync. It does not remove arbitrary custom fields; and
- custom field updates wake the profile-update stream for rooms shared by the local user.

Sources: [MSC4133](https://github.com/tcpipuk/matrix-spec-proposals/blob/main/proposals/4133-extended-profiles.md), Synapse [`profile.py` at v1.164.2](https://github.com/element-hq/synapse/blob/v1.164.2/synapse/handlers/profile.py), and Synapse [profile client servlet at v1.164.2](https://github.com/element-hq/synapse/blob/v1.164.2/synapse/rest/client/profile.py). The deployment already successfully wrote and publicly read `#a78bfa` for `@zhln:zhln.eu`, as supplied in the task.

### Items that still require an environment test

Do not claim universal federation support from the preceding source inspection.

1. Test two federated Synapse servers, with the colour owned by `matrix.zhln.eu` and read through a client homed on the other server. Test both whole-profile and single-field reads if practical.
2. Test whether a remote field change produces a usable `UserProfileUpdate`/MSC4429 sync update at the viewing client. Synapse's source explicitly documents an unsolved remote-update case for status; arbitrary-field behaviour must be measured.
3. Test the exact `.well-known`/version/capability responses of `matrix.zhln.eu` at rollout time. The pinned SDK's v1.16 detection is the compatibility gate; do not hard-code an unstable route in Element.
4. Establish product policy for colours from remote domains: the recommended MVP displays an authenticated/profile-API value when available, but never represents it as room-authoritative or durable.

## Design decisions

### Data model and validation

Use the string custom profile value `eu.zhln.nickname_color` exclusively. The canonical stored/published form is lower-case opaque six-digit sRGB hex:

```text
#rrggbb
```

Examples: `#a78bfa`, `#0f766e`. Do **not** accept CSS colour names, `rgb()`, `hsl()`, `var()`, alpha channels, `url()`, or styles supplied by the server. This prevents CSS injection and makes the same profile value portable between clients.

Provide a pure Web utility, proposed as `apps/web/src/utils/nicknameColor.ts`, with:

- `NICKNAME_COLOR_PROFILE_KEY = "eu.zhln.nickname_color"`;
- `parseNicknameColor(value: unknown): string | undefined`, which accepts only a string matching `/^#[0-9a-fA-F]{6}$/`, normalises it to lower case, and otherwise returns `undefined`;
- a contrast helper that computes WCAG relative luminance and contrast ratio; and
- a palette/normalisation policy described below.

**Accessibility policy:** a selected foreground must have contrast ratio at least **4.5:1** against both Element's light and dark nickname backgrounds as measured using the actual Compound design tokens in use at implementation time. A simple and auditable MVP is a fixed curated palette whose every swatch passes these checks, plus a reset option. Do not initially offer unrestricted arbitrary hex entry. If a custom hex input is later required, validate it against both backgrounds and keep Save disabled with an explicit error until it passes. Colour is decorative only: names remain text, MXID tooltips/disambiguation remain intact, and neither presence nor verification state uses the colour as its sole signal.

A received value that is malformed, unsupported, missing, or inaccessible is ignored. Rendering falls back to Element's current deterministic hash colour where that surface uses it, otherwise to the existing inherited text colour. Never re-write another user's malformed value. For the signed-in user, show the stored malformed state as “not set” and allow reset; only a deliberate Save/Delete modifies it.

### Profile API and capability policy

Use the SDK abstraction, not raw HTTP and not a fork-specific service:

```ts
await client.doesServerSupportExtendedProfiles();
await client.getExtendedProfileProperty(userId, NICKNAME_COLOR_PROFILE_KEY);
await client.setExtendedProfileProperty(NICKNAME_COLOR_PROFILE_KEY, canonicalColor);
await client.deleteExtendedProfileProperty(NICKNAME_COLOR_PROFILE_KEY);
```

The profile setting is available only after support probing resolves `true`. When unsupported, hide the editing control and show a concise non-error availability message only if there is space in the Profile section. Do not make login or the rest of profile settings fail.

For writes, use `setExtendedProfileProperty`, not whole-profile `setExtendedProfile`/`patchExtendedProfile`, so unrelated profile keys cannot be overwritten. Reset uses `deleteExtendedProfileProperty`, not a `PUT` with `null`; Synapse's v1.164.2 servlet may reject null values and deletion is the protocol operation designed for this purpose. Surface `M_FORBIDDEN`, `M_PROFILE_TOO_LARGE`, network and other write failures in the settings UI; preserve the previously confirmed colour on failure.

The server capability `m.profile_fields`, if exposed by the SDK's capability types/API at implementation time, may improve whether the editor is enabled, especially for an allowlist. It must not replace the support probe or error handling: a server can reject a specific field even if it advertises support. This fork's deployment should allow `eu.zhln.nickname_color` in any server-side allowlist.

### Cache, loading, and invalidation

Create a focused Web-only `NicknameColorStore` rather than extend `UserProfilesStore`:

- `UserProfilesStore` caches only legacy `IMatrixProfile`; it is intentionally invalidated from room membership changes, which custom global fields do not generate.
- The new store should be owned lazily by `SDKContextClass`, as `userProfilesStore` is, and cleared on `onLoggedOut`.
- Maintain bounded LRU entries (start at 500 to match `UserProfilesStore`) keyed by user ID. An entry has a parsed value (`string | undefined`) and a load state. Deduplicate in-flight fetches per user ID.
- Store negative results for the session to prevent repeated `404`/unsupported requests from each timeline tile. A rejected non-`M_NOT_FOUND` request should be logged once/rate-limited and treated as no custom colour; use a short retry policy only after performance measurement.
- First consult the SDK via `getExtendedProfileProperty`; the SDK itself can satisfy known fields from its user-profile store, then caches HTTP responses.
- Subscribe to `ClientEvent.UserProfileUpdate`. If the event profile contains this key, parse it, replace the cache entry, and emit an update. If it is `null` or lacks the key, invalidate that user entry; refetch lazily only for a visible consumer. This avoids assuming that an omitted field means deletion.
- After a successful own write/delete, update the own entry optimistically only after the HTTP operation resolves, emit store change, and retain the confirmed value even if a sync update is delayed. Invalidate/refetch after a conflicting later profile update.

Do not enable `unstableMSC4429SyncUserProfileFields` for this feature until its traffic/privacy behaviour and remote update behaviour are verified. The MVP works correctly with on-demand reads and event-driven invalidation. A later performance task can add this field to the existing option in `MatrixClientPeg`, guarded by the server feature/protocol test and accompanied by a sync-traffic test.

Use a React hook such as `useNicknameColor(userId?: string)` to subscribe to the store and initiate a fetch only for mounted, visible name surfaces. It returns `undefined` while absent/loading/error; UI never blocks on it. Ensure unsubscribe/cancellation guards prevent setting React state after unmount.

### Update propagation model

1. **Save:** Profile settings validates the candidate, disables duplicate save/reset actions, calls SDK set/delete, updates `NicknameColorStore`, and rerenders the settings preview immediately after success.
2. **Same browser:** all mounted `useNicknameColor` consumers for that user observe the store event and rerender.
3. **Another own device/local shared users:** the server profile update/sync event should invalidate/update the corresponding cache. A visible name refetches when necessary.
4. **Federated user:** a first visible name may require a profile lookup through the viewing user's homeserver, which may query the remote homeserver. Delivery speed and later invalidation are not guaranteed; fallback is intentional.
5. **Room history:** display name and avatar can be historical member-event data; nickname colour is global and current when fetched. It must never be inserted into historical membership content. Document this difference in user-facing text/tooltip only if it becomes confusing.

## UI/UX specification

### Profile settings

Add a “Nickname colour” control to the existing **Profile** section in `UserProfileSettings`, below display name/status and before account-management actions.

MVP UI:

- An accessible labelled swatch grid (radio group) with 10–16 curated named choices; names such as “Violet” are labels, not profile values.
- A separate “Default” radio/reset control which means no `eu.zhln.nickname_color` profile key.
- A live preview showing the signed-in user's current display name on the current theme background, plus its swatch/name. The preview is text and `aria-live="polite"` only for successful save/reset or errors; changing selection should not create noisy announcements.
- **Save** is disabled with no pending change, while support is unknown, or while a request is in progress. **Reset** is enabled only when a confirmed or newly selected custom colour exists. Cancel/revert restores the last confirmed value.
- On success, announce “Nickname colour saved” or “Nickname colour reset.” On failure, retain the chosen draft, show a translated error, and provide retry. Do not claim sync/federation completion.
- If unavailable, retain normal profile controls. Explain that the homeserver does not support extended profiles rather than suggesting a local browser setting.

The setting is intentionally a profile-level setting, not a `SettingsStore` account/device setting. It must travel with the Matrix account and be readable by compatible clients.

### Rendering coverage

Define coverage in stages rather than issuing background requests from every string occurrence.

**MVP (required):**

1. Timeline sender names, including normal, compact, IRC/bubble/group layouts, replies and thread summaries that use `DisambiguatedProfileViewModel`/`DisambiguatedProfileView`.
2. Room member-list names (`RoomMemberTileView` already uses the same profile view).
3. User profile/right-panel heading (`UserInfoHeaderView`).
4. Rendered user mention pills (`Pill.tsx`) for a user permalink/mention.

**Post-MVP, separately measured:** composer autocomplete suggestions, read receipts, room previews, search/Spotlight results, invite dialog, forwarded-message dialog, event summaries, user menu and every other direct `rawDisplayName`/`displayName` rendering. Include a repository search audit before each extension. “Wherever Element renders the display name” is the long-term target, but the MVP must not create an N+1 profile request from virtualised lists or message history.

For the shared timeline view, preserve the existing deterministic `colorClass` fallback. The expected minimal shared-package extension is to add an optional validated CSS custom-property/style contract to `DisambiguatedProfileViewSnapshot`/`DisambiguatedProfileView`, allowing Web to put `color: var(--mx-nickname-color)` on the display-name element while retaining existing class behaviour. Do not encode arbitrary colours as generated CSS classes or mutate a stylesheet at runtime. If a design review finds a Web-only wrapper that can safely style exactly the display-name element, prefer it to a shared change; document the decision and test all existing shared-component consumers.

Use one central helper, e.g. `getNicknameColorStyle(color)`, returning a typed CSS custom-property object only for `parseNicknameColor` output. Do not spread server data into `style`.

### Mentions and semantics

The colour styles the text that Element renders, not the Matrix mention content/attributes. Do not change `matrix.to` links, mention notifications, autocomplete insertion text, or room member state. A user who has no value, uses another client, or is viewed by an unmodified client continues to work normally.

## Compatibility, privacy, security, and performance

- **Unmodified clients:** ignore the namespaced field and continue with `displayname`/`avatar_url`; no compatibility break.
- **Unsupported homeserver:** settings remains usable except for this control; all names use fallback colours. No raw experimental endpoint requests are made when the SDK reports unsupported.
- **Server rejects an allowed-looking write:** keep the confirmed UI state, present error, and do not retry automatically.
- **Malformed or hostile remote input:** accept only canonical six-digit hex after runtime validation; ignore all else. No HTML is rendered and no arbitrary CSS is permitted.
- **Privacy:** profiles are public/global data. The UI must warn in help text that this colour may be publicly readable and should not encode sensitive meaning. Do not use it for access control, trust, power level, or identity verification.
- **Federation:** retrieval is best effort. Verify locally and across federation before rollout; remote homeservers can omit fields and remote updates may be stale. Do not promise immediate cross-server propagation.
- **Accessibility:** curated palette passes contrast checks in light, dark and high-contrast themes; test keyboard radios, visible focus, screen-reader labels, and that coloured text is still understandable without colour.
- **Performance:** no all-member prefetch, no unconditional timeline-history fetch, LRU/in-flight deduplication/negative cache, lazy visible consumers, and update events over polling. Measure profile requests during a large-room scroll before enabling any sync-field optimisation.

## Code integration map

| Concern | Existing extension point | Planned responsibility |
| --- | --- | --- |
| Client creation / optional sync | `apps/web/src/MatrixClientPeg.ts` | Leave unchanged in MVP; later evaluate adding key to `unstableMSC4429SyncUserProfileFields`. |
| SDK context lifecycle | `apps/web/src/contexts/SDKContextClass.ts` | Lazily create and clear `nicknameColorStore`, following `userProfilesStore`. |
| Own profile data | `apps/web/src/stores/OwnProfileStore.ts` | Either expose own colour from the dedicated store or keep it separate; do not overload legacy display name/avatar fetches. |
| Legacy profile cache | `apps/web/src/stores/UserProfilesStore.ts` | Do not modify for MVP. Its membership invalidation is semantically wrong for global custom fields. |
| Status pattern | `apps/web/src/utils/userStatus.ts`, `hooks/useUserStatus.ts` | Reuse support probe/error/event patterns, but do not duplicate status's two-field call logic. |
| Data/cache utilities | new `apps/web/src/utils/nicknameColor.ts`, `stores/NicknameColorStore.ts`, `hooks/useNicknameColor.ts` | Parse/contrast; bounded cache and event invalidation; React subscription. |
| Settings | `components/views/settings/UserProfileSettings.tsx` and its test | Picker, preview, save/delete/error UI. |
| Timeline/member names | `viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel.ts`; shared `DisambiguatedProfileView` | Consume custom colour with safe fallback. |
| Right panel | `components/views/right_panel/user_info/UserInfoHeaderView.tsx` | Apply hook/style to heading. |
| Pills | `components/views/elements/Pill.tsx` | Apply hook/style only to user mention text. |
| Existing style system | `apps/web/res/css/_common.pcss` | Retain hash classes as fallback; add only a narrowly scoped custom-property rule if required. |
| Translation | `apps/web/src/i18n/strings/en_EN.json` and `pnpm i18n` | Add all UI/error/help strings and regenerate translations. |

## Non-goals for MVP

- Per-room colours, room-state changes, server plugins, Synapse schema/config modifications, a custom backend, Element Desktop work, colour export/import, and colourisation of avatars/messages.
- Replacing Element's existing hash colour algorithm for users without a valid custom value.
- Claiming or depending on universal federation propagation.
- Adding a free-form colour picker until accessibility validation for every supported theme is designed and tested.

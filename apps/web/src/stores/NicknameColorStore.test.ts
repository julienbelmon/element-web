/*
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";
import { getMockClientWithEventEmitter, mockClientMethodsUser } from "test-utils";

import { NICKNAME_COLOR_PROFILE_KEY } from "../utils/nicknameColor";
import { NicknameColorStore } from "./NicknameColorStore";

const userId = "@alice:example.org";
const client = getMockClientWithEventEmitter({
    ...mockClientMethodsUser(),
    doesServerSupportExtendedProfiles: vi.fn(),
    getExtendedProfileProperty: vi.fn(),
    setExtendedProfileProperty: vi.fn(),
    deleteExtendedProfileProperty: vi.fn(),
}) as unknown as MatrixClient & {
    doesServerSupportExtendedProfiles: ReturnType<typeof vi.fn>;
    getExtendedProfileProperty: ReturnType<typeof vi.fn>;
    setExtendedProfileProperty: ReturnType<typeof vi.fn>;
    deleteExtendedProfileProperty: ReturnType<typeof vi.fn>;
};

describe("NicknameColorStore", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.doesServerSupportExtendedProfiles.mockResolvedValue(true);
        client.getExtendedProfileProperty.mockResolvedValue("#A78BFA");
    });

    it("fetches, validates and caches a colour", async () => {
        const store = new NicknameColorStore(client);
        await expect(store.getOrFetch(userId)).resolves.toBe("#a78bfa");
        await expect(store.getOrFetch(userId)).resolves.toBe("#a78bfa");
        expect(client.getExtendedProfileProperty).toHaveBeenCalledTimes(1);
        expect(client.getExtendedProfileProperty).toHaveBeenCalledWith(userId, NICKNAME_COLOR_PROFILE_KEY);
        store.dispose();
    });

    it("deduplicates in-flight requests and ignores malformed values", async () => {
        let resolve: (value: string) => void;
        client.getExtendedProfileProperty.mockReturnValue(new Promise<string>((r) => (resolve = r)));
        const store = new NicknameColorStore(client);
        const first = store.getOrFetch(userId);
        const second = store.getOrFetch(userId);
        resolve!("rgb(1, 2, 3)");
        await expect(first).resolves.toBeUndefined();
        await expect(second).resolves.toBeUndefined();
        expect(client.getExtendedProfileProperty).toHaveBeenCalledTimes(1);
        store.dispose();
    });

    it("updates cached values from a profile update", async () => {
        const store = new NicknameColorStore(client);
        await store.getOrFetch(userId);
        const listener = vi.fn();
        store.subscribe(listener);
        client.emit(ClientEvent.UserProfileUpdate, userId, { [NICKNAME_COLOR_PROFILE_KEY]: "#0F766E" });
        expect(store.get(userId)).toBe("#0f766e");
        expect(listener).toHaveBeenCalledTimes(1);
        store.dispose();
    });

    it("uses single-property set and delete operations for the own user", async () => {
        const store = new NicknameColorStore(client);
        await store.setOwnColor("#A78BFA");
        expect(client.setExtendedProfileProperty).toHaveBeenCalledWith(NICKNAME_COLOR_PROFILE_KEY, "#a78bfa");
        await store.deleteOwnColor();
        expect(client.deleteExtendedProfileProperty).toHaveBeenCalledWith(NICKNAME_COLOR_PROFILE_KEY);
        store.dispose();
    });
});

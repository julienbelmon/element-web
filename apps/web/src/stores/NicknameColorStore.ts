/*
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ClientEvent, type MatrixClient, MatrixError } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { LruCache } from "../utils/LruCache";
import { NICKNAME_COLOR_PROFILE_KEY, parseNicknameColor } from "../utils/nicknameColor";

const CACHE_SIZE = 500;
type NicknameColor = string | undefined;
type Listener = () => void;

/** Cached extended-profile nickname colours, scoped to one Matrix client session. */
export class NicknameColorStore {
    private readonly colors = new LruCache<string, NicknameColor>(CACHE_SIZE);
    private readonly inFlight = new Map<string, Promise<NicknameColor>>();
    private readonly listeners = new Set<Listener>();
    private disposed = false;

    public constructor(private readonly client: MatrixClient) {
        client.on(ClientEvent.UserProfileUpdate, this.onUserProfileUpdate);
    }

    /** Return a cached colour, or undefined when it is absent or has not been fetched. */
    public get(userId: string): NicknameColor {
        return this.colors.get(userId);
    }

    /** Subscribe to changes in any cached nickname colour. */
    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Fetch a colour on cache miss, deduplicating concurrent requests for the same user. */
    public getOrFetch(userId: string): Promise<NicknameColor> {
        if (this.colors.has(userId)) return Promise.resolve(this.colors.get(userId));
        const existing = this.inFlight.get(userId);
        if (existing) return existing;

        const request = this.fetch(userId).finally(() => this.inFlight.delete(userId));
        this.inFlight.set(userId, request);
        return request;
    }

    /** Persist the signed-in user's selected colour and update the confirmed local cache. */
    public async setOwnColor(color: string): Promise<void> {
        const parsed = parseNicknameColor(color);
        if (!parsed) throw new Error("Nickname colours must be six-digit hex values");
        await this.client.setExtendedProfileProperty(NICKNAME_COLOR_PROFILE_KEY, parsed);
        this.set(this.client.getSafeUserId(), parsed);
    }

    /** Delete the signed-in user's selected colour and update the confirmed local cache. */
    public async deleteOwnColor(): Promise<void> {
        await this.client.deleteExtendedProfileProperty(NICKNAME_COLOR_PROFILE_KEY);
        this.set(this.client.getSafeUserId(), undefined);
    }

    /** Stop listening to the client and discard all session state. */
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.client.removeListener(ClientEvent.UserProfileUpdate, this.onUserProfileUpdate);
        this.colors.clear();
        this.inFlight.clear();
        this.listeners.clear();
    }

    private async fetch(userId: string): Promise<NicknameColor> {
        if (this.disposed || !(await this.client.doesServerSupportExtendedProfiles())) return undefined;
        let color: NicknameColor;
        try {
            color = parseNicknameColor(
                await this.client.getExtendedProfileProperty(userId, NICKNAME_COLOR_PROFILE_KEY),
            );
        } catch (error) {
            if (!(error instanceof MatrixError && error.errcode === "M_NOT_FOUND")) {
                logger.warn(`Failed to get nickname colour for ${userId}`, error);
            }
            color = undefined;
        }
        if (!this.disposed) this.set(userId, color);
        return color;
    }

    private onUserProfileUpdate = (userId: string, profile: Record<string, unknown> | null): void => {
        if (this.disposed || !this.colors.has(userId)) return;
        if (profile && NICKNAME_COLOR_PROFILE_KEY in profile) {
            this.set(userId, parseNicknameColor(profile[NICKNAME_COLOR_PROFILE_KEY]));
        } else {
            this.colors.delete(userId);
            this.emit();
        }
    };

    private set(userId: string, color: NicknameColor): void {
        if (this.colors.get(userId) === color && this.colors.has(userId)) return;
        this.colors.set(userId, color);
        this.emit();
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

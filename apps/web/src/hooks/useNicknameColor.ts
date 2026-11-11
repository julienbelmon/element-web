/*
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useContext, useEffect, useState } from "react";

import { SDKContext } from "../contexts/SDKContext";

/** Fetch and reactively observe a user's validated global nickname colour. */
export function useNicknameColor(userId?: string): string | undefined {
    const sdkContext = useContext(SDKContext);
    const store = sdkContext.client ? sdkContext.nicknameColorStore : undefined;
    const [color, setColor] = useState<string | undefined>(() => (userId ? store?.get(userId) : undefined));

    useEffect(() => {
        if (!userId || !store) {
            setColor(undefined);
            return;
        }

        let active = true;
        const update = (): void => setColor(store.get(userId));
        const unsubscribe = store.subscribe(update);
        update();
        void store.getOrFetch(userId).then((value) => {
            if (active) setColor(value);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [store, userId]);

    return color;
}

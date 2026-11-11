/*
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
    getNicknameColorStyle,
    NICKNAME_COLOR_PALETTE,
    nicknameColorContrastRatio,
    parseNicknameColor,
} from "./nicknameColor";

describe("parseNicknameColor", () => {
    it("accepts only six-digit hex and canonicalises casing", () => {
        expect(parseNicknameColor("#A78BFA")).toBe("#a78bfa");
        expect(parseNicknameColor("#a78bfa")).toBe("#a78bfa");
    });

    it.each([undefined, null, 12, "a78bfa", "#abc", "#a78bfaa", " #a78bfa", "rgb(1, 2, 3)", "var(--x)"])(
        "rejects unsafe or malformed input %j",
        (value) => expect(parseNicknameColor(value)).toBeUndefined(),
    );
});

describe("getNicknameColorStyle", () => {
    it("returns only a canonical custom property", () => {
        expect(getNicknameColorStyle("#A78BFA")).toEqual({ "--mx-nickname-color": "#a78bfa" });
        expect(getNicknameColorStyle("red")).toBeUndefined();
    });
});

describe("nickname colour palette", () => {
    it("contains canonical, unique colours", () => {
        const colors = NICKNAME_COLOR_PALETTE.map(({ value }) => value);
        expect(colors.every((color) => parseNicknameColor(color) === color)).toBe(true);
        expect(new Set(colors)).toHaveLength(colors.length);
    });

    it("calculates a WCAG contrast ratio", () => {
        expect(nicknameColorContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    });
});

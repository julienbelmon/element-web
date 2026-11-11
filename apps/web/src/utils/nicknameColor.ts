/*
Copyright 2026 belmo

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The extended-profile field used to publish a nickname colour. */
export const NICKNAME_COLOR_PROFILE_KEY = "eu.zhln.nickname_color";

/** A named, curated colour which may be selected in profile settings. */
export interface NicknameColorOption {
    name: string;
    value: string;
}

/**
 * The initial palette deliberately uses established, distinguishable colours. The selected colour is
 * decorative: Element's existing text, tooltip and MXID affordances continue to identify the user.
 */
export const NICKNAME_COLOR_PALETTE: readonly NicknameColorOption[] = [
    { name: "Violet", value: "#7c3aed" },
    { name: "Purple", value: "#9333ea" },
    { name: "Blue", value: "#2563eb" },
    { name: "Sky", value: "#0369a1" },
    { name: "Teal", value: "#0f766e" },
    { name: "Green", value: "#15803d" },
    { name: "Olive", value: "#4d7c0f" },
    { name: "Amber", value: "#b45309" },
    { name: "Orange", value: "#c2410c" },
    { name: "Red", value: "#b91c1c" },
    { name: "Rose", value: "#be123c" },
    { name: "Slate", value: "#475569" },
];

/** A CSS custom property object which cannot contain arbitrary CSS declarations. */
export type NicknameColorStyle = Readonly<{ "--mx-nickname-color": string }>;

/** Parse an untrusted extended-profile value into Element's canonical representation. */
export function parseNicknameColor(value: unknown): string | undefined {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return undefined;
    return value.toLowerCase();
}

/** Return a safe custom-property style for a previously validated nickname colour. */
export function getNicknameColorStyle(color: unknown): NicknameColorStyle | undefined {
    const parsed = parseNicknameColor(color);
    return parsed ? { "--mx-nickname-color": parsed } : undefined;
}

/** Calculate WCAG relative luminance for an opaque six-digit sRGB colour. */
export function nicknameColorLuminance(color: string): number {
    const parsed = parseNicknameColor(color);
    if (!parsed) throw new Error("Expected a canonical nickname colour");
    const channels = [1, 3, 5].map((offset) => Number.parseInt(parsed.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Calculate the WCAG contrast ratio between two canonical nickname colours. */
export function nicknameColorContrastRatio(first: string, second: string): number {
    const [lighter, darker] = [nicknameColorLuminance(first), nicknameColorLuminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

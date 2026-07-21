import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	resolveContentEditorSeoSlot,
	type ContentEditorSeoSlotContext,
} from "../../src/lib/content-editor-seo-slot";
import type { PluginAdmins } from "../../src/lib/plugin-context";

function SeoEditor(_props: ContentEditorSeoSlotContext) {
	return <div>Plugin SEO</div>;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveContentEditorSeoSlot", () => {
	it("resolves an enabled plugin for a supported collection", () => {
		const pluginAdmins: PluginAdmins = {
			seo: {
				contentEditorSlots: {
					seo: { component: SeoEditor, collections: ["posts"] },
				},
			},
		};

		expect(
			resolveContentEditorSeoSlot(pluginAdmins, "posts", { seo: { enabled: true } }),
		).toMatchObject({ pluginId: "seo" });
	});

	it("ignores disabled and inapplicable plugins", () => {
		const pluginAdmins: PluginAdmins = {
			disabled: { contentEditorSlots: { seo: { component: SeoEditor } } },
			pagesOnly: {
				contentEditorSlots: { seo: { component: SeoEditor, collections: ["pages"] } },
			},
		};

		expect(
			resolveContentEditorSeoSlot(pluginAdmins, "posts", {
				disabled: { enabled: false },
				pagesOnly: { enabled: true },
			}),
		).toBeUndefined();
	});

	it("ignores registry modules that are not present in the manifest", () => {
		const pluginAdmins: PluginAdmins = {
			configured: { contentEditorSlots: { seo: { component: SeoEditor } } },
			stale: { contentEditorSlots: { seo: { component: SeoEditor, order: -1 } } },
		};

		expect(
			resolveContentEditorSeoSlot(pluginAdmins, "posts", {
				configured: { enabled: true },
			}),
		).toMatchObject({ pluginId: "configured" });
	});

	it("supports collection predicates and contains predicate failures", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const pluginAdmins: PluginAdmins = {
			broken: {
				contentEditorSlots: {
					seo: {
						component: SeoEditor,
						collections: () => {
							throw new Error("predicate failed");
						},
					},
				},
			},
			posts: {
				contentEditorSlots: {
					seo: { component: SeoEditor, collections: (collection) => collection === "posts" },
				},
			},
		};

		expect(resolveContentEditorSeoSlot(pluginAdmins, "posts")?.pluginId).toBe("posts");
		expect(errorSpy).toHaveBeenCalledOnce();
	});

	it("ignores malformed extensions at runtime", () => {
		const pluginAdmins = {
			nullModule: null,
			missingComponent: { contentEditorSlots: { seo: {} } },
			invalidOrder: {
				contentEditorSlots: { seo: { component: SeoEditor, order: Number.NaN } },
			},
		} as unknown as PluginAdmins;

		expect(resolveContentEditorSeoSlot(pluginAdmins, "posts")).toBeUndefined();
	});

	it("uses order then plugin ID to resolve collisions deterministically", () => {
		const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const pluginAdmins: PluginAdmins = {
			zeta: { contentEditorSlots: { seo: { component: SeoEditor, order: 10 } } },
			beta: { contentEditorSlots: { seo: { component: SeoEditor, order: 1 } } },
			alpha: { contentEditorSlots: { seo: { component: SeoEditor, order: 1 } } },
		};

		expect(resolveContentEditorSeoSlot(pluginAdmins, "posts")?.pluginId).toBe("alpha");
		expect(warningSpy).toHaveBeenCalledOnce();
	});
});

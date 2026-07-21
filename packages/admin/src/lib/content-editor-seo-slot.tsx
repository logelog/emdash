import * as React from "react";

import type { AdminManifest, ContentItem, ContentSeo, ContentSeoInput } from "./api";
import type { PluginAdmins } from "./plugin-context";

export interface ContentEditorSeoSlotContext {
	collection: string;
	entry: ContentItem;
	locale?: string;
	seo?: ContentSeo;
	onChange: (seo: ContentSeoInput) => void;
}

export interface ContentEditorSeoSlotExtension {
	component: React.ComponentType<ContentEditorSeoSlotContext>;
	/** Restrict this editor to selected collections. Omit to support every SEO-enabled collection. */
	collections?: readonly string[] | ((collection: string) => boolean);
	/** Lower values win when more than one plugin can handle the same collection. */
	order?: number;
}

export interface ResolvedContentEditorSeoSlot {
	pluginId: string;
	extension: ContentEditorSeoSlotExtension;
}

function isComponent(value: unknown): value is React.ComponentType<ContentEditorSeoSlotContext> {
	return typeof value === "function";
}

function isApplicable(
	pluginId: string,
	extension: ContentEditorSeoSlotExtension,
	collection: string,
): boolean {
	const { collections } = extension;
	if (collections === undefined) return true;
	if (Array.isArray(collections)) return collections.includes(collection);
	if (typeof collections !== "function") return false;

	try {
		return collections(collection);
	} catch (error) {
		console.error(`Plugin "${pluginId}" failed while checking its content editor SEO slot.`, error);
		return false;
	}
}

/**
 * Resolve the single trusted plugin that may replace the native SEO editor body.
 * Invalid, disabled, or inapplicable extensions are ignored so the host can fall
 * back to its built-in SEO editor.
 */
export function resolveContentEditorSeoSlot(
	pluginAdmins: PluginAdmins,
	collection: string,
	pluginStates?: AdminManifest["plugins"],
): ResolvedContentEditorSeoSlot | undefined {
	const candidates: ResolvedContentEditorSeoSlot[] = [];

	for (const [pluginId, adminModule] of Object.entries(pluginAdmins)) {
		const pluginState = pluginStates?.[pluginId];
		if (pluginStates && (!pluginState || pluginState.enabled === false)) continue;

		const extension = adminModule?.contentEditorSlots?.seo;
		if (!extension || !isComponent(extension.component)) continue;
		if (extension.order !== undefined && !Number.isFinite(extension.order)) continue;
		if (!isApplicable(pluginId, extension, collection)) continue;

		candidates.push({ pluginId, extension });
	}

	candidates.sort(
		(a, b) =>
			(a.extension.order ?? 0) - (b.extension.order ?? 0) || a.pluginId.localeCompare(b.pluginId),
	);

	const winner = candidates[0];
	if (winner && candidates.length > 1) {
		console.warn(
			`Multiple plugins registered a content editor SEO slot for "${collection}". ` +
				`Using "${winner.pluginId}".`,
		);
	}

	return winner;
}

interface ContentEditorSeoSlotBoundaryProps {
	pluginId: string;
	fallback: React.ReactNode;
	children: React.ReactNode;
}

interface ContentEditorSeoSlotBoundaryState {
	hasError: boolean;
}

/** Keeps a faulty trusted plugin from taking down the content editor. */
export class ContentEditorSeoSlotBoundary extends React.Component<
	ContentEditorSeoSlotBoundaryProps,
	ContentEditorSeoSlotBoundaryState
> {
	override state: ContentEditorSeoSlotBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ContentEditorSeoSlotBoundaryState {
		return { hasError: true };
	}

	override componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error(
			`Plugin "${this.props.pluginId}" failed while rendering the content editor SEO slot.`,
			error,
			info,
		);
	}

	override render() {
		return this.state.hasError ? this.props.fallback : this.props.children;
	}
}

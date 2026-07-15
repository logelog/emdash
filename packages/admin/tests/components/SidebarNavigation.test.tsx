/** Browser-level navigation behavior for nested collection menus. */

import { LinkProvider, type LinkComponentProps } from "@cloudflare/kumo";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { Sidebar, SidebarNav, type SidebarNavProps } from "../../src/components/Sidebar";
import type { CurrentUser } from "../../src/lib/api/current-user";
import { PluginAdminProvider } from "../../src/lib/plugin-context";

const routerState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@tanstack/react-router", async () => {
	const react = await import("react");
	return {
		useLocation: () => ({ pathname: routerState.pathname }),
		Link: react.forwardRef<HTMLAnchorElement, { to: string; children?: React.ReactNode }>(
			({ to, children, ...props }, ref) =>
				react.createElement("a", { ref, href: to, ...props }, children),
		),
	};
});

const ROLE_ADMIN = 50;

function manifest(): SidebarNavProps["manifest"] {
	return {
		collections: {
			pages: { label: "Pages", labelSingular: "Page" },
			posts: { label: "Posts", labelSingular: "Post" },
		},
		taxonomies: [
			{
				name: "category",
				label: "Categories",
				hierarchical: true,
				collections: ["posts"],
			},
			{
				name: "tag",
				label: "Tags",
				collections: ["posts"],
			},
		],
		plugins: {},
		version: "1.2.3",
		admin: { siteName: "Test Site" },
	};
}

function adminUser(): CurrentUser {
	return { id: "u1", email: "admin@example.com", name: "Ada", role: ROLE_ADMIN };
}

const TestLink = React.forwardRef<HTMLAnchorElement, LinkComponentProps>(
	({ href, to, children, ...props }, ref) => (
		<a ref={ref} href={href ?? to} {...props}>
			{children}
		</a>
	),
);
TestLink.displayName = "TestLink";

function mountSidebar(options: { path?: string; open?: boolean } = {}) {
	routerState.pathname = options.path ?? "/";
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	queryClient.setQueryData(["currentUser"], adminUser());

	return render(
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<PluginAdminProvider pluginAdmins={{}}>
					<LinkProvider component={TestLink}>
						<Sidebar.Provider defaultOpen={options.open ?? true}>
							<SidebarNav manifest={manifest()} />
						</Sidebar.Provider>
					</LinkProvider>
				</PluginAdminProvider>
			</I18nProvider>
		</QueryClientProvider>,
	);
}

function sidebarEl(): HTMLElement {
	const element = document.querySelector<HTMLElement>('[data-sidebar="sidebar"]');
	if (!element) throw new Error("sidebar not rendered");
	return element;
}

function linkByHref(href: string): HTMLAnchorElement | undefined {
	return [...sidebarEl().querySelectorAll<HTMLAnchorElement>("a[href]")].find(
		(link) => link.getAttribute("href") === href,
	);
}

function menuTrigger(name: string): HTMLButtonElement | undefined {
	return [...sidebarEl().querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find(
		(button) => button.textContent?.trim() === name,
	);
}

beforeEach(() => {
	window.localStorage.clear();
	routerState.pathname = "/";
});

describe("SidebarNav collection submenus", () => {
	it("keeps ordinary collections as links and nested collections closed off-route", async () => {
		await mountSidebar({ path: "/content/pages" });
		await expect.poll(() => linkByHref("/content/pages")).toBeTruthy();

		expect(linkByHref("/content/pages")?.hasAttribute("data-active")).toBe(true);
		expect(menuTrigger("Posts")?.getAttribute("aria-expanded")).toBe("false");
	});

	it("reveals the full collection workflow from one parent trigger", async () => {
		await mountSidebar({ path: "/content/pages" });
		await expect.poll(() => menuTrigger("Posts")).toBeTruthy();

		menuTrigger("Posts")?.click();
		await expect.poll(() => menuTrigger("Posts")?.getAttribute("aria-expanded")).toBe("true");

		for (const href of [
			"/content/posts",
			"/content/posts/new",
			"/taxonomies/category",
			"/taxonomies/tag",
		]) {
			expect(linkByHref(href), `${href} is reachable`).toBeTruthy();
		}
	});

	it("opens the owning collection and marks its taxonomy child active", async () => {
		await mountSidebar({ path: "/taxonomies/category" });
		await expect.poll(() => menuTrigger("Posts")?.getAttribute("aria-expanded")).toBe("true");

		expect(menuTrigger("Posts")?.hasAttribute("data-active")).toBe(false);
		const category = linkByHref("/taxonomies/category");
		expect(category?.hasAttribute("data-active")).toBe(true);
		expect(
			[...sidebarEl().querySelectorAll("a")].filter(
				(link) => link.textContent?.trim() === "Categories",
			),
		).toHaveLength(1);
	});

	it("keeps a nested collection reachable when the sidebar is collapsed", async () => {
		await mountSidebar({ path: "/", open: false });
		await expect.poll(() => linkByHref("/content/posts")).toBeTruthy();

		expect(menuTrigger("Posts")).toBeUndefined();
		expect(linkByHref("/content/posts")?.getAttribute("data-sidebar")).toBe("menu-button");
	});
});

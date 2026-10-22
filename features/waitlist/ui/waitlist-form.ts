// Progressive enhancement for the waitlist forms on the landing page.
//
// Without this script a form posts to /api/waitlist as a normal form, and the server redirects back with
// #joined or #bad-email, which the CSS turns into a message. With it, the form posts JSON, keeps the page
// where it is, and shows the result in the status line under the field.

const SENDING = "Joining…";
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const UNKNOWN_ERROR = "Something went wrong. Try again in a moment.";

export function enhanceWaitlistForms(root: ParentNode = document): void {
	for (const form of root.querySelectorAll<HTMLFormElement>("form[data-waitlist]")) enhance(form);
}

function enhance(form: HTMLFormElement): void {
	const input = form.querySelector<HTMLInputElement>('input[name="email"]');
	const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
	const status = form.querySelector<HTMLElement>("[data-status]");
	if (!input || !button || !status) return;

	const label = button.textContent;
	let sending = false;

	const show = (message: string, state: "ok" | "error" | "") => {
		status.textContent = message;
		status.dataset.state = state;
	};

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (sending) return;

		sending = true;
		form.setAttribute("aria-busy", "true");
		// aria-disabled instead of disabled: the button keeps focus and stays reachable while the request runs.
		button.setAttribute("aria-disabled", "true");
		button.textContent = SENDING;
		show("", "");

		try {
			const response = await fetch(form.action, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify({ email: input.value }),
			});
			const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
			if (response.ok) {
				show(data.message ?? "You're on the list.", "ok");
				form.reset();
			} else {
				show(data.error ?? UNKNOWN_ERROR, "error");
				input.focus();
			}
		} catch {
			show(NETWORK_ERROR, "error");
		} finally {
			sending = false;
			form.removeAttribute("aria-busy");
			button.removeAttribute("aria-disabled");
			button.textContent = label;
		}
	});
}

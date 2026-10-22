// Browser entry. The landing page is static HTML and CSS (index.html and features/landing/ui/landing.css), so it
// renders with no JavaScript. The only script is the waitlist form, which posts JSON and shows the result inline.
import { enhanceWaitlistForms } from "../features/waitlist/ui/waitlist-form.ts";

enhanceWaitlistForms();

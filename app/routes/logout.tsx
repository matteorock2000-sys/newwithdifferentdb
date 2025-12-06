import type { ActionFunctionArgs } from "@remix-run/node";
import { logout } from "~/services/auth.server";

// This is a resource route that handles the POST request for logging out.
export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

// We export a loader to prevent Remix from throwing an error if someone tries to navigate to /logout directly via GET.
export async function loader() {
  return logout(new Request("http://localhost/"));
}

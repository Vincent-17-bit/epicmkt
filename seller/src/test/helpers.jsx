import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routes } from "../routes.jsx";
import { ThemeProvider } from "../state/theme.jsx";
import { useSession } from "../state/session.js";
import * as mock from "../api/mock.js";

export const freshSession = () => {
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    return;
  }
  mock.resetMock();
  useSession.setState({ phase: "loading", me: null, notice: null });
};

export const signInAs = async (id, password = mock.DEMO_PASSWORD) => {
  await mock.login(id, password);
  useSession.setState({ phase: "loading", me: null });
};

export const renderApp = (path = "/", basename) => {
  const router = createMemoryRouter(routes, { basename: basename || undefined, initialEntries: [`${basename ?? ""}${path}`] });
  const view = render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
  return { router, ...view };
};

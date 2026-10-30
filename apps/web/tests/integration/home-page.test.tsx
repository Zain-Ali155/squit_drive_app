import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceFoundation } from "../../features/workspace-foundation/components";

test("renders a production-ready SQUID Drive sign-in landing without local-demo copy", () => {
  const markup = renderToStaticMarkup(<WorkspaceFoundation authControls={<a href="/auth/google/login">Sign in with Google</a>} />);
  assert.match(markup, /Your files, all in one place/);
  assert.match(markup, /Sign in securely with your Google account/);
  assert.match(markup, /Sign in with Google/);
  assert.doesNotMatch(markup, /local workspace|demo owner|Runtime foundation|API boundary|Open SQUID Drive/iu);
});

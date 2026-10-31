import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInPage } from '../src/components/auth/SignInPage';

const render = (props: Partial<React.ComponentProps<typeof SignInPage>> = {}) =>
  renderToStaticMarkup(React.createElement(SignInPage, { configured: true, onSignIn: () => {}, ...props }));

test('the Google entry point serves sign-in and first-time signup without collecting credentials', () => {
  const page = render();
  assert.match(page, /Continue with Google/);
  assert.match(page, /Sign up with Google/);
  assert.match(page, /Access may be restricted to approved accounts/);
  assert.match(page, /<button[^>]*type="button"/);
  assert.doesNotMatch(page, /<input|type="password"/);
  assert.doesNotMatch(page, /disabled=""/);
});

test('unconfigured, pending and error states are visible and accessible', () => {
  const unconfigured = render({ configured: false });
  assert.match(unconfigured, /disabled=""/);
  assert.match(unconfigured, /role="alert"/);
  assert.match(unconfigured, /VITE_SUPABASE_URL/);
  const pending = render({ pending: true });
  assert.match(pending, /Connecting to Google/);
  assert.match(pending, /disabled=""/);
  assert.match(render({ error: 'Google is unavailable' }), /role="alert">Google is unavailable/);
});

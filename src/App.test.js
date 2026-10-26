import { render, screen, act } from '@testing-library/react';

// Fake supabase-js: one signed-in user, a profiles lookup we control, and a handle on the auth mockListener.
let mockProfileResult;
let mockListener;
const mockProfileCalls = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: (cb) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: () => Promise.resolve({}),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => (mockProfileCalls(), Promise.resolve(mockProfileResult)) }) }),
    }),
  }),
}));

const App = require('./App').default;

beforeEach(() => mockProfileCalls.mockClear());

test('signed in with no profile row -> no-access screen, not an endless spinner', async () => {
  mockProfileResult = { data: null, error: null };
  render(<App />);
  expect(await screen.findByText(/no access profile yet/i)).toBeInTheDocument();
  expect(screen.getByText('Sign out')).toBeInTheDocument();
});

test('profile lookup fails -> error screen with Try again', async () => {
  mockProfileResult = { data: null, error: { message: 'network' } };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<App />);
  expect(await screen.findByText(/could not load your access profile/i)).toBeInTheDocument();
  expect(screen.getByText('Try again')).toBeInTheDocument();
});

test('token refresh for the same user does not reload the profile', async () => {
  mockProfileResult = { data: null, error: null };
  render(<App />);
  await screen.findByText(/no access profile yet/i);
  const calls = mockProfileCalls.mock.calls.length;
  await act(async () => {
    mockListener('TOKEN_REFRESHED', { user: { id: 'u1' } });
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(mockProfileCalls.mock.calls.length).toBe(calls);
});

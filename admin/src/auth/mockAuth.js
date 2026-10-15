// Mock auth for local work while VITE_SUPABASE_URL is empty. It is never used against a real project.
//
//   Email:  owner@  reviewer@  finance@  support@  (anything before the @ picks the role)
//           stranger@  signs in but has no admin row, so it lands on the "no access" page
//   Password: any, at least 8 characters
//   Authenticator code: 123456
//
// The mock keeps its state in sessionStorage so a reload behaves like a real session.
const KEY = "epicmkt-admin-mock-auth";
const ROLE_BY_NAME = { owner: "owner", reviewer: "reviewer", finance: "finance", support: "support" };

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
};
const write = (state) => {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the mock just forgets on reload */
  }
};

let memory = read();
const save = (state) => {
  memory = state;
  write(state);
};

const snap = () => {
  if (!memory || memory.signedOut) return { user: null, admin: null, aal: null, nextAal: null, sessionId: null };
  const role = ROLE_BY_NAME[memory.email.split("@")[0]] ?? null;
  return {
    user: { id: `mock-${memory.email}`, email: memory.email },
    admin: role ? { userId: `mock-${memory.email}`, role, email: memory.email, name: role[0].toUpperCase() + role.slice(1) + " (mock)" } : null,
    aal: memory.aal2 ? "aal2" : "aal1",
    nextAal: memory.enrolled ? "aal2" : "aal1",
    sessionId: "mock-session-this",
  };
};

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockAuth = {
  async init() {
    return snap();
  },
  async signIn(email, password) {
    await wait();
    if (!/^[^@\s]+@[^@\s]+$/.test(email.trim()) || password.length < 8) {
      throw new AuthError("bad_credentials", "That email and password do not match.");
    }
    const next = email.trim().toLowerCase();
    save({ email: next, enrolled: Boolean(memory?.enrolled && memory.email === next), aal2: false });
    return snap();
  },
  async enrol() {
    await wait();
    return { factorId: "mock-factor", qr: null, secret: "MOCKMOCKMOCKMOCK" };
  },
  async verifyEnrol(_factorId, code) {
    await wait();
    if (code !== "123456") throw new AuthError("bad_code", "That code did not work. Check your authenticator app and try again.");
    save({ ...memory, enrolled: true, aal2: true });
    return snap();
  },
  async challenge(code) {
    await wait();
    if (code !== "123456") throw new AuthError("bad_code", "That code did not work. Check your authenticator app and try again.");
    save({ ...memory, aal2: true });
    return snap();
  },
  async signOut() {
    // Keep the "enrolled" flag for this email so signing back in goes to the challenge, as a real account would.
    save(memory ? { email: memory.email, enrolled: memory.enrolled, aal2: false, signedOut: true } : null);
  },
  async signOutOthers() {
    await wait();
    memory = { ...memory, othersSignedOut: true };
    write(memory);
  },
  async listSessions() {
    await wait(150);
    const now = Date.now();
    const sessions = [
      { id: "mock-session-this", createdAt: new Date(now - 40 * 60_000).toISOString(), lastActiveAt: new Date(now - 20_000).toISOString(), userAgent: navigator.userAgent, ip: "127.0.0.1" },
    ];
    if (!memory?.othersSignedOut) {
      sessions.push(
        { id: "mock-session-2", createdAt: new Date(now - 26 * 3600_000).toISOString(), lastActiveAt: new Date(now - 3 * 3600_000).toISOString(), userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1", ip: "102.68.10.4" },
        { id: "mock-session-3", createdAt: new Date(now - 5 * 24 * 3600_000).toISOString(), lastActiveAt: new Date(now - 2 * 24 * 3600_000).toISOString(), userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0", ip: "41.80.22.9" },
      );
    }
    return sessions;
  },
  onChange() {
    return () => {};
  },
};

export { AuthError };

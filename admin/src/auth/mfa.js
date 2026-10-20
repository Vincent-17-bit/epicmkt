// Where the person is in the sign-in flow once they are known to be an admin, from the session's assurance level:
//   aal2                          the session has passed the authenticator: let them in
//   nextLevel is aal2             they have an authenticator, this session has not used it yet: ask for the code
//   otherwise                     no authenticator yet: walk them through setting one up
// Admin access is checked before this, so a non-admin is never walked through setup.
export function mfaStage({ currentLevel, nextLevel } = {}) {
  if (currentLevel === "aal2") return "ready";
  return nextLevel === "aal2" ? "needsChallenge" : "needsEnrol";
}

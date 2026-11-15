# Request: a scripted seller sign-in for browser QA

From: final QA (11.8). To: seller app owner.

The seller editor can only be checked in a real browser by someone signing in by hand. Please add a mock-mode sign-in that a Playwright script can reach (for example `?demo=seller` in a mock build only, refused in a real build). With that, axe at 360 and 1280 and a bundle baseline can be part of CI.

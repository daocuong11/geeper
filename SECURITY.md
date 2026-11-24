# Security policy

Geeper is meant to run on your own machine and has no user accounts: don't expose its port
(3300) to a network you don't trust. It stores social-network tokens for publishing and runs external
tools (ffmpeg, Python, Docker), so we take reports seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/saihdez/geeper/security/advisories/new).

Include what you found, how to reproduce it, and the commit you tested. You'll get a reply within
7 days. Once a fix is released, you'll be credited unless you'd rather not be.

## Supported versions

Only the latest commit on the default branch gets security fixes.

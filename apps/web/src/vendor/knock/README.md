# knock-audio (vendored)

Copied from `MayurJivani/Knock` v0.1.0, MIT (LICENSE alongside). Ultrasonic room
joining: the host screen plays a frame carrying the room code, phones in earshot
decode it and join.

**Vendored rather than depended on.** The package is not published to npm, and a
`file:../Knock` dependency cannot resolve inside the container — the Docker build
context is the Chorus directory alone, so the sibling checkout does not exist at
build time. It is ~460 lines of dependency-free ES modules with no build step, so
copying is cheaper than the alternatives.

Do not edit these files. Fix upstream and re-copy, or the next sync silently
reverts the change. Chorusify's own wiring lives in
`apps/web/src/features/multiplayer/knockJoin.ts`.

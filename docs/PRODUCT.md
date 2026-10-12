# Product

Status: draft intent, October 11, 2026. Only what the project brief states is recorded here.
Everything else is explicitly open.

## What BidaZoo is

An educational-game platform: a place where children play games that teach, and where the
learning record (mastery, progress, rewards) is trustworthy because the server decides it.

It is a **new** project. Hop Quest and Fact Crew are reference implementations only: their good
learning-engine and identity/platform concepts may inform BidaZoo, but BidaZoo is not a fork,
and weaknesses are corrected instead of copied.

## First game

**Zoo Sprint.** Not implemented. Gameplay begins at a later checkpoint, after the foundation is
reviewed and approved.

## Principles

1. **Server-authoritative progress.** A browser cannot grant itself XP, coins, or items.
2. **Fun is client-side; truth is server-side.** Animation and feel belong to the game; answers
   and rewards belong to the platform.
3. **Platform, not one game.** Games plug in through a small SDK and share one learning engine.
4. **Minimal child data.** Nicknames and opaque ids, not real-world identity.
5. **Works on a small phone.** The target floor is a 360x640 screen. Active question screens show
   the question and primary answer controls without scrolling.

## Explicitly out of scope for now

Multiplayer, QR controllers, classrooms, teacher dashboards, parent dashboards, AI-generated
lessons, subscriptions, purchases, stores, chat, friends, user-generated content, real-time 3D,
elaborate world maps, production account migration, and production deployment.

## Open product questions

- Target ages and grade bands for the first release.
- Which skills and standards Zoo Sprint covers first.
- How children and families sign in, and how parental consent works.
- What the reward economy is (the architecture only requires that the server owns it).
- Whether and how existing Hop Quest or Fact Crew players carry over (deliberately deferred).

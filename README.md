# Dithered stars

A dark night-sky look for the Claude desktop and mobile apps. The backdrop is a sky shaded with an ordered pixel dither: a blue glow rising from the horizon, two drifts of purple nebula and a dithered crescent moon. The stars are drawn in text characters. Far stars sit still, near ones twinkle from `.` to `+` to `*`, a few flare into bursts, and two shooting stars fall with slash trails. Panels are night-sky ink at 62% opacity with no blur, so the pixels stay sharp behind the words.

All motion is CSS inside the scene, and it stops when your system asks for reduced motion. The terminal and editors draw no look.

## Install

At the prompt of a terminal session:

```
/plugin install dithered-stars --marketplace choco-mazapan/dithered-stars
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install dithered-stars --marketplace choco-mazapan/dithered-stars
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `choco-mazapan/dithered-stars`, then Add plugin.

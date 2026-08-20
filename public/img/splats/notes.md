What I built instead

  An ablation ladder on current HEAD, in a throwaway worktree, with env-gated switches that rewind one idea at a time. Same photo, same 72k budget, same base size, same seven-level ladder in every image — so each
  step is exactly one variable.

  ┌────────────────┬────────────────────┬───────────────────────────────────────────────────────────┐
  │                │      section       │                       what changed                        │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 01-mosaic.png  │ Edges (before)     │ regular lattice, uniform density, round axis-aligned dabs │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 02-edges.png   │ Edges (after)      │ covariance from the structure tensor                      │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 03-wavelet.png │ Enter the Wavelet  │ detail map decides where the fine marks go                │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 04-nogrid.png  │ Killing the Grid   │ avalanche-hashed positions                                │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 05-noise.png   │ Noise as a Feature │ Perlin flow, per-stroke jitter, bent traces               │
  ├────────────────┼────────────────────┼───────────────────────────────────────────────────────────┤
  │ 06-layered.png │ Layering           │ underpainting, glazes, edge tier                          │
  └────────────────┴────────────────────┴───────────────────────────────────────────────────────────┘

  Plus 00-source.jpg and 06-detail.png (a 2× crop of 05 vs 06, since that last step reads better up close). All eight are wired into post.md with captions. img/post/README.md has the exact recipes and
  ablations.patch reproduces the switches.

  Nothing tracked changed — post.md and img/ are both gitignored, so there's nothing to commit or push. The repo is clean apart from your pre-existing ideas.md. The wt-abl worktree is still registered if you want to
  re-render anything.

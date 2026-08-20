# Progression images for post.md

Six renders of `img/loki-goofy.jpg`, each adding back one idea from the post. Same
image, same budget (72k), same base size, same seven-level ladder throughout — only
the named idea changes between consecutive images.

Going back through git history does not produce this ladder: the very first commit
(`a2d6690`) already has the tensor, the wavelet, Perlin and coarse-to-fine layering
in it, so the interesting steps all predate the repo. These are ablations of the
current code instead, which also keeps every other variable pinned.

`ablations.patch` applies to HEAD and adds the env-gated switches. Apply it to a
throwaway worktree, not to main:

    git worktree add /tmp/wt-abl HEAD --detach
    git -C /tmp/wt-abl apply /path/to/ablations.patch

Switches it adds (all off by default — unset, the shader is byte-identical):

| env | effect |
| --- | --- |
| `SP_ABL_ROUND` | no structure tensor: round, axis-aligned dabs |
| `SP_ABL_GRID` | stratified lattice instead of hashed positions |
| `SP_ABL_NOWAV` | no detail map: every level paints its whole candidate set |
| `SP_ABL_NOLAYER` | no underpainting/glaze ladder — every stroke opaque, own colour |
| `SP_ABL_NOCHAIN` | one dab per seed instead of a traced stroke chain |
| `GA_PAINTER_CURV` | the Curvature slider (the only one with no env override on HEAD) |

Recipes (from `/tmp/wt-abl`, `GA_PAINTER_QUIT_MS=150000 GA_PAINTER_DETAIL=1` on all
of them, plus `GA_PAINTER_SAVE_PNG=<out>`):

    01-mosaic   VAR=0 CURV=0 SWIRL=0 CUTIN=0  NOLAYER NOCHAIN NOWAV GRID ROUND
    02-edges    VAR=0 CURV=0 SWIRL=0 CUTIN=0  NOLAYER NOCHAIN NOWAV GRID
    03-wavelet  VAR=0 CURV=0 SWIRL=0 CUTIN=0  NOLAYER NOCHAIN       GRID
    04-nogrid   VAR=0 CURV=0 SWIRL=0 CUTIN=0  NOLAYER NOCHAIN
    05-noise                          CUTIN=0 NOLAYER
    06-layered  (nothing — the shipped pipeline)

(`VAR`/`CURV`/`SWIRL`/`CUTIN` are the `GA_PAINTER_*` overrides; the rest are `SP_ABL_*=1`.)

`06-detail.png` is a 2x crop of `05-noise` and `06-layered` side by side:

    magick <stage>.png -crop 380x260+300+230 +repage -resize 200% c-<stage>.png
    magick c-05-noise.png c-06-layered.png +append 06-detail.png

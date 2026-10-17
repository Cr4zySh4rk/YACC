# 3D guitar model

`web/models/guitar.glb` is based on **"Guitar Hero Controller"** by **CamSear16**
(https://sketchfab.com/3d-models/guitar-hero-controller-bcac8f9f95a44008ad90f470326e5fca),
licensed under **CC-BY-4.0** (http://creativecommons.org/licenses/by/4.0/).

Changes made for YAGCC (shape untouched):

* the frets, strum bar, Start / Back buttons and whammy bar are separate nodes with their own pivots so the configurator can animate them;
* the static parts are merged into two meshes (plastic and chrome);
* the front plate is recoloured blue-purple (#5B4EE8) with a black trim (set `YAGCC_FACE=rrggbb` when building for another colour);
* brand marks were removed from the textures (headstock wordmark, embossed logo, console guide-button logo, rear label);
* textures were downsized to 2048 px JPEG and the glossiness map was converted to a roughness map.

`build_glb.py` reproduces the file from the two Sketchfab downloads (instructions at the top of the script).
The 3D view uses three.js (MIT), bundled as `web/vendor/three-yagcc.js`.

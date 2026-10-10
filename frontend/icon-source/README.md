`icon-square-512.png` is the original square logo tile. `round.html` shows it with 22% rounded corners on a transparent
background; the PNGs in `public/icons/` (favicon-48, icon-192, icon-512) are screenshots of it:

    msedge --headless --default-background-color=00000000 --hide-scrollbars --window-size=W,H --force-device-scale-factor=S --screenshot=OUT round.html

`apple-touch-icon.png` and `icon-maskable-512.png` stay full-bleed squares on purpose: iOS and Android apply their own mask.

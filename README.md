# Aeriform

An interactive seat-booking prototype for a fictional London to Tokyo flight. Orbit the wide-body twinjet against a full-screen cloudscape, reveal the cabin inside the same aircraft, choose a seat in 3D or on the keyboard-accessible map, and complete a simulated checkout. The app uses a single demo flight, one passenger, and USD fares.

## Run locally

Use Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The production build runs with `npm run build` followed by `npm start`.

The original Windows workspace also contains a portable Node.js runtime used for verification. If Node is unavailable on `PATH` in that workspace, run the following in PowerShell.

```powershell
$env:Path = (Join-Path $PWD '.tools/node-v22.22.0-win-x64') + ';' + $env:Path
npm.cmd run dev
```

Drag the aircraft to orbit and use the wheel or zoom buttons to inspect it. On touch screens, drag to orbit and pinch to zoom. In the 2D map, use Tab or the arrow keys to move between seats and Enter or Space to select. The map also works when WebGL or the aircraft asset is unavailable. System reduced-motion preferences shorten the camera and interface transitions.

## How it works

- **Scene.** Next.js serves the flight details and loads a client-side Three.js WebGL renderer through React Three Fiber. Drei supplies model loading and orbit controls. GSAP drives eased spherical camera moves and synchronizes them with the fuselage reveal. The custom seat meshes use instancing and dedicated raycast boxes. Seat view adds an enclosed cabin with curved ceiling panels, bins, lighting strips, and window scenery. The scene runs on demand with capped pixel density.
- **Seat inventory.** [The cabin definition](lib/flight.ts) supplies seat IDs, prices, classes, amenities, and coordinates. Zustand synchronizes the 3D scene, 2D map, detail panel, and checkout. Occupied seats can be inspected in 3D and are unavailable for booking in either view.
- **Simulated checkout.** `GET /api/demo` returns availability and can look up an opaque receipt reference. `POST /api/demo` calculates the total from server-side data, rejects occupied seats, and returns the same receipt for a repeated checkout request. A single Node process serializes writes and atomically saves them to `.demo-data/bookings.json`. Set `AERIFORM_DATA_DIR` to use another writable directory. The browser stores the latest receipt reference. Checkout collects no personal or payment information.

## Browser verification

Run `npm run typecheck` and `npm run build`. With the app running and Chrome installed, run `npm run test:browser`. Set `SMOKE_URL` to use another base URL and `CHROME_PATH` for a custom Chrome executable. Use a fresh `AERIFORM_DATA_DIR` for the test server because the smoke test reserves seats. `SCREENSHOT_DIR` controls where the test writes screenshots.

The browser test covers aircraft orbit and zoom, 3D raycast selection, synchronized and keyboard-operated seat selection, checkout, receipt restoration, mobile layout, simultaneous seat claims, idempotent retry, and the fallback after a failed 3D asset load.

| Screenshot | View |
| --- | --- |
| [Aircraft](screenshots/aircraft-desktop.png) | Desktop exterior and flight overview |
| [Cabin](screenshots/cabin-desktop.png) | 3D cutaway and cabin controls |
| [Seat details](screenshots/seat-detail.png) | Focused camera and selected seat amenities |
| [Seat view](screenshots/seat-view.png) | Camera at the selected seat’s eye level |
| [Seat map](screenshots/seat-map.png) | Synchronized desktop map |
| [Checkout](screenshots/checkout.png) | Simulated payment review |
| [Receipt](screenshots/receipt.png) | Simulated booking confirmation |
| [Mobile aircraft](screenshots/aircraft-mobile.png) and [mobile map](screenshots/seat-map-mobile.png) | Responsive layouts |

## Research and asset credits

- **Interaction references.** Contrail informed the exterior-to-cabin sequence and unified seat inventory. Flybetter3D informed the separation of camera controls, seat picking, and reservation UI. The implementation uses the `threejs-web` and `threejs-r3f` skills from the referenced skill pack. [Contrail](https://gr8rstudio.com/work/contrail), [Flybetter3D](https://github.com/shadow3312/flybetter3d), [Three.js agent skills](https://github.com/cesartevisual/threejs-skills).
- **Exterior.** `public/models/aeriform-widebody.glb` is Innerscene’s wide-body twinjet, released under CC0. `node scripts/prepare-aircraft.mjs <original.glb>` resizes and re-embeds its textures, reducing the 19.1 MB download to about 3.5 MB. The viewer hides landing-gear meshes for the flying configuration and clips the top of the fuselage with a shader during the cabin reveal. [Source model and license](https://www.innerscene.com/tools/library/3d-parts/wide-body-airliner-0560b943).
- **Cabin.** The interior is a procedural cutaway built for this project. Openly licensed candidates included Dixept’s partial cabin at 253k triangles and a detailed cabin with cockpit at 803.7k triangles. The prototype uses shared, lighter meshes with seat IDs bound directly to the mock inventory. [Airplane Inside](https://sketchfab.com/3d-models/airplane-inside-4fc41cb155cf4cf89cb41eac742227c2), [A detail airplane cabin](https://sketchfab.com/3d-models/a-detail-airplane-cabin-blender-7d175b0d6c6e4075b9a3648000174f8b).
- **Cloud backplate.** [Cloudscape WebP](public/images/cloudscape.webp) was generated with built-in ImageGen. The generation prompt follows.

  > Create a photorealistic panoramic aerial cloudscape backplate for a premium airline 3D viewer, wide landscape 3:2 composition. Camera at high altitude looking slightly down with a subtle horizontal horizon around upper third, cool blue sky fading to pearlescent ice blue, wide banks of textured sunlit cumulus clouds concentrated in bottom half with soft luminous white and slate blue shadows. Gentle early morning sun from upper left, subtle and low contrast. Make the center calm with pale blue depth for a separately composited aircraft. Only sky and clouds, no airplane, wing, windows, frame, land, text or graphics. Ultra realistic high-end travel editorial photography.

## Prototype limits

The exterior uses a generic wide-body asset. The custom cabin represents a shortened, simulated 98-seat configuration. An airline-specific production cabin would need variant-specific geometry and seating data, baked cabin textures, and validation on representative mobile GPUs. The JSON booking store is intended for a single local Node process. A multi-instance deployment would need shared transactional storage. Flight, seat availability, checkout, and receipts are simulated throughout.

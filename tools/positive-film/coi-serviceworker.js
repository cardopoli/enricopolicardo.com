/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/* Extended for the Positive Film tool with offline caching (see "Positive Film additions"). */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    // Positive Film additions: keep the tool on the device so it works offline
    // and repeat visits cost no bandwidth. Bump CACHE on every release.
    const CACHE = "positive-film-v0.4";
    const PRECACHE = ["./", "./coi-serviceworker.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
        "./libraw/index.js", "./libraw/worker.js", "./libraw/libraw.js", "./libraw/libraw.wasm",
        "../../assets/js/positive-film/pf-core.js", "../../assets/js/positive-film/looks.js", "../../assets/positive-film/positive-film-formula.json",
        "../../assets/positive-film/dog.jpg", "../../assets/positive-film/bkfoods.jpg", "../../assets/positive-film/tower.jpg", "../../assets/positive-film/looks-dog-1.jpg", "../../assets/positive-film/looks-dog-2.jpg"];
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("positive-film-") && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
            // fill the offline copy after taking control, so the first visit is not held up
            .then(() => caches.open(CACHE)).then((c) => c.addAll(PRECACHE)).catch((e) => console.warn("precache", e))));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    const isolate = (response) => {
        if (!response || response.status === 0) {
            return response;
        }
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
        );
        if (!coepCredentialless) {
            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
        }
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    };
    const keep = (r, response) => {
        if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(r, copy)).catch(() => {});
        }
        return response;
    };

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;
        const url = new URL(r.url);
        const cacheable = r.method === "GET" && (url.origin === self.location.origin || /(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname));
        if (!cacheable) {
            event.respondWith(fetch(request).then(isolate).catch((e) => console.error(e)));
            return;
        }
        if (r.mode === "navigate") {
            // page: network first so updates show at once, cached copy when offline
            event.respondWith(
                fetch(request).then((res) => isolate(keep(r, res)))
                    .catch(() => caches.match(r, { ignoreSearch: true }).then((c) => c || caches.match("./")).then(isolate)));
            return;
        }
        // everything else: cached copy first, refreshed in the background
        event.respondWith(caches.match(r).then((cached) => {
            const net = fetch(request).then((res) => keep(r, res));
            if (cached) {
                event.waitUntil(net.catch(() => {}));
                return isolate(cached);
            }
            return net.then(isolate);
        }).catch((e) => console.error(e)));
    });

} else {
    (() => {
        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => true,
            shouldDeregister: () => false,
            coepCredentialless: () => !(window.chrome || window.netscape),
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;

        if (n.serviceWorker && n.serviceWorker.controller) {
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: coi.coepCredentialless(),
            });

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already coi: do nothing. Perhaps it's due to this script doing its job, or COOP/COEP are
        // already set from the origin server. Also if the browser has no notion of crossOriginIsolated, just give up here.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Chrome incognito mode) this won't be available
        if (n.serviceWorker) {
            n.serviceWorker.register(window.document.currentScript.src).then(
                (registration) => {
                    !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                    registration.addEventListener("updatefound", () => {
                        !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
                        coi.doReload();
                    });

                    // If the registration is active, but it's not controlling the page
                    if (registration.active && !n.serviceWorker.controller) {
                        !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
                        coi.doReload();
                    }
                },
                (err) => {
                    !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
                }
            );
        }
    })();
}

v1.1.0

* [ ] track server passphrase hashes separately
* [ ] cli/daemon mode
* [ ] systray
* [ ] start on boot

---

v1.2.0

* [ ] speed optimisation
  - are our loops tight enough?
  - profiler (i 'ardly knew 'er!)
  - ???
* [ ] event-to-event (captured-to-injected) latency instrumentation (Impatience)
* [ ] benchmarks
  - synchronised timers on client and server
  - log input events with times on client
  - log input effects (button press, mouse over, etc) with times on server
  - send server logs to client and analyse

---

v2.0.0

* [ ] code cleanup
  - refactor to library -- cross-platform capture and injection
  - general de-fuglify
* [ ] known host management GUI
* [ ] game controller support
  - [ ] uinput on Linux
  - [ ] ViGEmBus on Windows?
  - [ ] CoreHID on macOS
* [ ] CoreHID on macOS for mouse input
* [ ] injector driver (virtual USB)?
* [ ] connected clients indicator on server
* [ ] multi client support on server
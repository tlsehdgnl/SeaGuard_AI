// SeaGuard FX — pointer spotlight, magnetic CTAs, metric count-up.
// Never adds/removes React-managed nodes or classes; only CSS variables,
// inline transforms on hover, and a text node value it restores exactly.
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const GLOW = ".metric, .place, .weather-postcard, .official-grid > a, .activity-postcards button, #plan .destination-tabs button";
addEventListener("pointermove", (e) => {
  const el = e.target.closest?.(GLOW);
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}, { passive: true });

// Magnetic pull on primary call-to-action buttons (desktop pointers only).
const MAGNET = ".journey-start, .step-controls .step-next";
let magnet = null;
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || reduced()) return;
  const el = e.target.closest?.(MAGNET);
  if (magnet && magnet !== el) { magnet.style.translate = ""; magnet = null; }
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
  const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  el.style.translate = `${dx * 8}px ${dy * 6}px`;
  magnet = el;
}, { passive: true });

// Count weather metrics up from 0 the first time they appear.
const seen = new WeakSet();
function countUp(p) {
  const node = [...p.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
  if (!node || seen.has(node)) return;
  seen.add(node);
  const raw = node.nodeValue;
  const target = parseFloat(raw);
  if (!Number.isFinite(target) || reduced()) return;
  const digits = (raw.trim().split(".")[1] || "").length;
  const start = performance.now();
  let last = raw;
  const tick = (now) => {
    if (node.nodeValue !== last) return; // React updated it; stop touching.
    const t = Math.min(1, (now - start) / 1100);
    const eased = 1 - Math.pow(1 - t, 4);
    last = t < 1 ? raw.replace(raw.trim(), (target * eased).toFixed(digits)) : raw;
    node.nodeValue = last;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const io = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) { countUp(entry.target); io.unobserve(entry.target); }
}, { threshold: .4 });
const watch = () => document.querySelectorAll(".metric p").forEach((p) => io.observe(p));
new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true });
watch();

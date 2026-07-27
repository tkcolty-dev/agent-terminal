const Inventory = (function () {
  const B = window.Minecraft2D.BLOCK;
  const slots = [
    [B.GRASS, "Grass", "#68bc3d"], [B.DIRT, "Dirt", "#85512d"],
    [B.STONE, "Stone", "#858b8f"], [B.WOOD, "Wood", "#8d592b"],
    [B.LEAVES, "Leaves", "#399b40"], [B.COAL, "Coal", "#2a2a2a"],
    [B.IRON, "Iron", "#c4a76b"]
  ];
  const counts = new Map(slots.map(s => [s[0], 0]));
  let selectedIndex = 0;

  function select(i) {
    selectedIndex = (i + slots.length) % slots.length;
    document.querySelectorAll("#hotbar .slot").forEach((el, n) => el.classList.toggle("selected", n === selectedIndex));
  }

  function renderCounts() {
    document.querySelectorAll("#hotbar .slot").forEach((el, i) => {
      const count = el.querySelector(".count");
      if (count) count.textContent = counts.get(slots[i][0]) || "";
    });
  }

  // Called after a successful mine with the block id that was removed.
  function add(blockId) {
    if (!counts.has(blockId)) return;
    counts.set(blockId, counts.get(blockId) + 1);
    renderCounts();
  }

  // Call before placing; returns true (and deducts one) if stock is available.
  function consume(blockId) {
    const n = counts.get(blockId) || 0;
    if (n <= 0) return false;
    counts.set(blockId, n - 1);
    renderCounts();
    return true;
  }

  function init() {
    const bar = document.getElementById("hotbar");
    bar.innerHTML = slots.map((s, i) => `<button class="slot ${i ? "" : "selected"}" data-i="${i}" title="${s[1]}"><span class="key">${i + 1}</span><span class="swatch" style="background:${s[2]}"></span><span class="count"></span></button>`).join("");
    bar.querySelectorAll(".slot").forEach(el => el.onclick = () => select(+el.dataset.i));
    addEventListener("keydown", e => { const n = +e.key; if (n >= 1 && n <= slots.length) select(n - 1); });
    addEventListener("wheel", e => select(selectedIndex + (e.deltaY > 0 ? 1 : -1)), { passive: true });
    renderCounts();
  }

  // For save/load: plain {blockId: count} snapshot, and a way to restore it.
  function getCounts() {
    return Object.fromEntries(counts);
  }
  function setCounts(saved) {
    if (!saved) return;
    for (const [id, n] of Object.entries(saved)) {
      if (counts.has(+id)) counts.set(+id, n);
    }
    renderCounts();
  }

  return {
    init, select, add, consume, getCounts, setCounts,
    get selected() { return slots[selectedIndex][0]; },
  };
})();

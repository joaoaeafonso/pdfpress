"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const { PDFDocument, StandardFonts } = PDFLib;

/* ---------------- helpers ---------------- */
function humanSize(n){
    let s = n;
    for (const u of ["B","KB","MB","GB","TB"]){
        if (s < 1024 || u === "TB") return u === "B" ? `${Math.round(s)} B` : `${s.toFixed(1)} ${u}`;
        s /= 1024;
    }
}
function naturalKey(name){
    return name.toLowerCase().split(/(\d+)/).map(t => /^\d+$/.test(t) ? t.padStart(12,"0") : t).join("");
}
const IMAGE_EXT = new Set(["jpg","jpeg","png","webp","gif","bmp","avif","ico"]);
const TEXT_EXT  = new Set(["txt","md","markdown","csv","tsv","log","json","xml","html","htm","css","js","py","java","c","cpp","h","sh","yml","yaml","toml","ini","sql","rs","go","rb","ts"]);
function classify(file){
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf" || file.type === "application/pdf") return "pdf";
    if (IMAGE_EXT.has(ext) || file.type.startsWith("image/")) return "image";
    if (TEXT_EXT.has(ext) || file.type.startsWith("text/")) return "text";
    return "unsupported";
}
function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}
const ICONS = {
    pdf:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    text: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    unsupported: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    up:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    x:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    check:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"/></svg>',
    dl:   '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
};

function showProgress(id, frac, msg){
    const p = document.getElementById(id);
    if(!p) return;
    p.classList.add("show");
    p.querySelector(".bar > div").style.width = `${Math.max(4, Math.round(frac*100))}%`;
    p.querySelector(".msg").textContent = msg;
}
function hideProgress(id){
    const p = document.getElementById(id);
    if(p) p.classList.remove("show");
}

function showResult(id, { title, stats, detail, blob, name, error }){
    const box = document.getElementById(id);
    if(!box) return;
    box.classList.add("show");
    box.textContent = "";
    const panel = el("div", "panel" + (error ? " error" : ""));
    const head = el("div","head");
    const ok = el("div","ok"); ok.innerHTML = error
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : ICONS.check;
    const ht = el("div");
    ht.appendChild(el("h3", null, title));
    head.append(ok, ht);
    panel.appendChild(head);
    if (stats && stats.length){
        const grid = el("div","stats");
        for (const [k,v,good] of stats){
            const s = el("div","stat");
            s.appendChild(el("div","k",k));
            s.appendChild(el("div","v" + (good ? " good" : ""), v));
            grid.appendChild(s);
        }
        panel.appendChild(grid);
    }
    if (detail) panel.appendChild(el("div", error ? "err-text" : "detail", detail));
    if (blob){
        const a = el("a","dl");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.innerHTML = ICONS.dl + ` Download ${name}`;
        panel.appendChild(a);
    }
    box.appendChild(panel);
    box.scrollIntoView({ behavior:"smooth", block:"nearest" });
}
function hideResult(id){
    const box = document.getElementById(id);
    if(box) box.classList.remove("show");
}

/* ---------------- drop zone wiring ---------------- */
function wireDrop(dropId, inputId, onFiles){
    const drop = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    if(!drop || !input) return;
    input.addEventListener("change", () => { onFiles([...input.files]); input.value = ""; });
    drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); input.click(); } });
    ["dragover","dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", e => onFiles([...e.dataTransfer.files]));
}

function singleFileRow(f){
    const li = el("li");
    const th = el("div","thumb"); th.innerHTML = ICONS.pdf;
    const meta = el("div","meta");
    meta.appendChild(el("div","name", f.name));
    meta.appendChild(el("div","info", `PDF · ${humanSize(f.size)}`));
    li.append(th, meta);
    return li;
}


document.addEventListener("DOMContentLoaded", () => {
    /* ============================================================
       TOOL 1 — MERGE
       ============================================================ */
    if (document.getElementById("input-combine")) {
        let combineFiles = [];
        let dragIndex = null;

        function renderCombineList(){
            const ul = document.getElementById("list-combine");
            ul.textContent = "";
            combineFiles.forEach((f, i) => {
                const kind = classify(f);
                const li = el("li", kind === "unsupported" ? "bad" : null);
                li.draggable = true;

                const th = el("div","thumb");
                if (kind === "image"){
                    const img = document.createElement("img");
                    img.alt = "";
                    img.src = URL.createObjectURL(f);
                    img.onload = () => URL.revokeObjectURL(img.src);
                    th.appendChild(img);
                } else {
                    th.innerHTML = ICONS[kind === "pdf" ? "pdf" : kind === "text" ? "text" : "unsupported"];
                }

                const meta = el("div","meta");
                meta.appendChild(el("div","name", f.name));
                meta.appendChild(el("div","info",
                    kind === "unsupported" ? "Unsupported — will be skipped" : `${kind.toUpperCase()} · ${humanSize(f.size)}`));

                const acts = el("div","actions");
                const mk = (icon, label, fn) => {
                    const b = el("button");
                    b.innerHTML = icon; b.title = label; b.setAttribute("aria-label", `${label}: ${f.name}`);
                    b.onclick = fn;
                    return b;
                };
                acts.append(
                    mk(ICONS.up, "Move up", () => { if (i>0){ [combineFiles[i-1],combineFiles[i]]=[combineFiles[i],combineFiles[i-1]]; renderCombineList(); } }),
                    mk(ICONS.down, "Move down", () => { if (i<combineFiles.length-1){ [combineFiles[i+1],combineFiles[i]]=[combineFiles[i],combineFiles[i+1]]; renderCombineList(); } }),
                    mk(ICONS.x, "Remove", () => { combineFiles.splice(i,1); renderCombineList(); })
                );

                li.append(th, meta, acts);

                li.addEventListener("dragstart", () => { dragIndex = i; li.classList.add("dragging"); });
                li.addEventListener("dragend", () => { dragIndex = null; li.classList.remove("dragging"); });
                li.addEventListener("dragover", e => { e.preventDefault(); li.classList.add("over"); });
                li.addEventListener("dragleave", () => li.classList.remove("over"));
                li.addEventListener("drop", e => {
                    e.preventDefault(); li.classList.remove("over");
                    if (dragIndex === null || dragIndex === i) return;
                    const [moved] = combineFiles.splice(dragIndex, 1);
                    combineFiles.splice(i, 0, moved);
                    renderCombineList();
                });

                ul.appendChild(li);
            });
            document.getElementById("tip-combine").classList.toggle("show", combineFiles.length > 1);
            document.getElementById("run-combine").disabled =
                !combineFiles.some(f => classify(f) !== "unsupported");
        }

        wireDrop("drop-combine","input-combine", files => {
            hideResult("out-combine");
            combineFiles = combineFiles.concat(files)
                .sort((a,b) => naturalKey(a.name) < naturalKey(b.name) ? -1 : 1);
            renderCombineList();
        });

        async function imageToJpeg(file, forcePortrait){
            let bitmap;
            try {
                bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
            } catch {
                const url = URL.createObjectURL(file);
                try {
                    const img = new Image();
                    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
                    bitmap = img;
                } finally { URL.revokeObjectURL(url); }
            }
            const w = bitmap.width, h = bitmap.height;
            const rotate = forcePortrait && w > h;
            const canvas = document.createElement("canvas");
            canvas.width = rotate ? h : w;
            canvas.height = rotate ? w : h;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0,0,canvas.width,canvas.height);
            if (rotate){ ctx.translate(canvas.width, 0); ctx.rotate(Math.PI/2); }
            ctx.drawImage(bitmap, 0, 0);
            if (bitmap.close) bitmap.close();
            const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.92));
            return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
        }

        function addTextPages(doc, font, text){
            const A4 = [595.28, 841.89], margin = 50, size = 10, leading = 12.5;
            const maxChars = Math.floor((A4[0] - 2*margin) / (size * 0.6));
            const maxLines = Math.floor((A4[1] - 2*margin) / leading);
            const clean = text.replace(/\r\n?/g,"\n").replace(/\t/g,"    ")
                .replace(/[^\n\x20-\x7E\xA0-\xFF]/g,"?");
            const lines = [];
            for (const raw of clean.split("\n")){
                if (raw.length === 0){ lines.push(""); continue; }
                for (let i = 0; i < raw.length; i += maxChars) lines.push(raw.slice(i, i+maxChars));
            }
            let pageCount = 0;
            for (let i = 0; i < lines.length; i += maxLines){
                const page = doc.addPage(A4);
                pageCount++;
                lines.slice(i, i+maxLines).forEach((line, j) => {
                    if (line) page.drawText(line, { x: margin, y: A4[1]-margin-j*leading, size, font });
                });
            }
            if (pageCount === 0){ doc.addPage(A4); pageCount = 1; }
            return pageCount;
        }

        document.getElementById("run-combine").addEventListener("click", async () => {
            const btn = document.getElementById("run-combine");
            btn.disabled = true;
            hideResult("out-combine");
            const forcePortrait = document.getElementById("opt-portrait").checked;
            const log = [];
            let added = 0, totalPages = 0, skipped = 0;
            try {
                const out = await PDFDocument.create();
                let courier = null;
                for (let i = 0; i < combineFiles.length; i++){
                    const f = combineFiles[i];
                    const kind = classify(f);
                    showProgress("prog-combine", i/combineFiles.length, `Processing ${f.name}…`);
                    try {
                        if (kind === "pdf"){
                            const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
                            const pages = await out.copyPages(src, src.getPageIndices());
                            pages.forEach(p => out.addPage(p));
                            totalPages += pages.length; added++;
                        } else if (kind === "image"){
                            const { bytes, w, h } = await imageToJpeg(f, forcePortrait);
                            const jpg = await out.embedJpg(bytes);
                            const scale = 72/150;
                            const page = out.addPage([w*scale, h*scale]);
                            page.drawImage(jpg, { x:0, y:0, width:w*scale, height:h*scale });
                            totalPages += 1; added++;
                        } else if (kind === "text"){
                            if (!courier) courier = await out.embedFont(StandardFonts.Courier);
                            totalPages += addTextPages(out, courier, await f.text());
                            added++;
                        } else {
                            skipped++; log.push(`Skipped ${f.name} (unsupported type)`);
                        }
                    } catch (err){
                        skipped++; log.push(`Skipped ${f.name}: ${err.message || err}`);
                    }
                }
                showProgress("prog-combine", 1, "Writing PDF…");
                if (added === 0) throw new Error("None of the files could be added. Check the list for skipped items.");
                const bytes = await out.save({ useObjectStreams: true });
                const blob = new Blob([bytes], { type: "application/pdf" });
                showResult("out-combine", {
                    title: "Your PDF is ready",
                    stats: [
                        ["Files merged", String(added)],
                        ["Pages", String(totalPages)],
                        ["Size", humanSize(blob.size)],
                        ...(skipped ? [["Skipped", String(skipped)]] : [])
                    ],
                    detail: log.length ? log.join("\n") : null,
                    blob, name: "merged.pdf"
                });
            } catch (err){
                showResult("out-combine", { title: "Couldn't merge the files", detail: String(err.message || err), error: true });
            } finally {
                hideProgress("prog-combine");
                btn.disabled = false;
            }
        });
    }

    /* ============================================================
       TOOL 2 — COMPRESS (lossless)
       ============================================================ */
    if (document.getElementById("input-compress")) {
        let compressFile = null;
        wireDrop("drop-compress","input-compress", files => {
            const f = files.find(x => classify(x) === "pdf");
            if (!f) return;
            hideResult("out-compress");
            compressFile = f;
            const ul = document.getElementById("list-compress");
            ul.textContent = "";
            ul.appendChild(singleFileRow(f));
            document.getElementById("run-compress").disabled = false;
        });

        document.getElementById("run-compress").addEventListener("click", async () => {
            const btn = document.getElementById("run-compress");
            btn.disabled = true;
            hideResult("out-compress");
            try {
                showProgress("prog-compress", .25, "Reading PDF…");
                const before = compressFile.size;
                const doc = await PDFDocument.load(await compressFile.arrayBuffer(), { ignoreEncryption: true });
                const pages = doc.getPageCount();
                showProgress("prog-compress", .7, "Repacking structure…");
                const bytes = await doc.save({ useObjectStreams: true });
                const blob = new Blob([bytes], { type: "application/pdf" });
                const after = blob.size, saved = before - after;
                const base = compressFile.name.replace(/\.pdf$/i,"");
                showResult("out-compress", {
                    title: saved > 0 ? "Compressed — quality untouched" : "Already well optimized",
                    stats: [
                        ["Pages", `${pages}`],
                        ["Before", humanSize(before)],
                        ["After", humanSize(after)],
                        ["Saved", saved > 0 ? `−${(saved/before*100).toFixed(1)}%` : "0%", saved > 0]
                    ],
                    detail: saved > 0 ? null
                        : "This PDF's structure was already tight. For real savings, try the Shrink to size tool.",
                    blob, name: `${base}_compressed.pdf`
                });
            } catch (err){
                showResult("out-compress", { title: "Couldn't compress this PDF", detail: String(err.message || err), error: true });
            } finally {
                hideProgress("prog-compress");
                btn.disabled = false;
            }
        });
    }

    /* ============================================================
       TOOL 3 — SHRINK (lossy, target-size search)
       ============================================================ */
    if (document.getElementById("input-shrink")) {
        let shrinkFile = null;
        wireDrop("drop-shrink","input-shrink", files => {
            const f = files.find(x => classify(x) === "pdf");
            if (!f) return;
            hideResult("out-shrink");
            shrinkFile = f;
            const ul = document.getElementById("list-shrink");
            ul.textContent = "";
            ul.appendChild(singleFileRow(f));
            document.getElementById("run-shrink").disabled = false;
        });

        /* chips + inputs */
        document.querySelectorAll(".chip[data-mb]").forEach(c => c.addEventListener("click", () => {
            document.querySelectorAll(".chip[data-mb]").forEach(x => x.setAttribute("aria-pressed","false"));
            c.setAttribute("aria-pressed","true");
            document.getElementById("opt-target").value = c.dataset.mb;
        }));
        document.getElementById("opt-target").addEventListener("input", () =>
            document.querySelectorAll(".chip[data-mb]").forEach(x => x.setAttribute("aria-pressed","false")));

        function syncRange(input, out, fmt){
            const upd = () => {
                out.textContent = fmt(input.value);
                const pct = (input.value - input.min) / (input.max - input.min) * 100;
                input.style.setProperty("--fill", pct + "%");
            };
            input.addEventListener("input", upd); upd();
        }
        syncRange(document.getElementById("opt-quality"), document.getElementById("q-val"), v => v);
        syncRange(document.getElementById("opt-maxdim"), document.getElementById("d-val"), v => `${v} px`);

        document.getElementById("opt-manual").addEventListener("change", e => {
            const manual = e.target.checked;
            document.getElementById("shrink-target-opts").style.display = manual ? "none" : "";
            document.getElementById("f-quality").style.display = manual ? "" : "none";
            document.getElementById("f-maxdim").style.display = manual ? "" : "none";
        });

        const QUALITY_LADDER = [
            [2400,82],[2000,78],[1800,72],[1600,66],[1400,60],
            [1200,55],[1000,50],[850,45],[700,42],[600,40],[520,38]
        ];

        async function shrinkOnce(pdfjsDoc, quality, maxDim, onPage){
            const out = await PDFDocument.create();
            const n = pdfjsDoc.numPages;
            for (let i = 1; i <= n; i++){
                if (onPage) onPage(i, n);
                const page = await pdfjsDoc.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const scale = Math.min(maxDim / Math.max(base.width, base.height), 4);
                const vp = page.getViewport({ scale: Math.max(scale, 0.1) });
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(vp.width));
                canvas.height = Math.max(1, Math.round(vp.height));
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#fff";
                ctx.fillRect(0,0,canvas.width,canvas.height);
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality/100));
                const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
                const p = out.addPage([base.width, base.height]);
                p.drawImage(jpg, { x:0, y:0, width: base.width, height: base.height });
                canvas.width = canvas.height = 0;
            }
            const bytes = await out.save({ useObjectStreams: true });
            return new Blob([bytes], { type: "application/pdf" });
        }

        document.getElementById("run-shrink").addEventListener("click", async () => {
            const btn = document.getElementById("run-shrink");
            btn.disabled = true;
            hideResult("out-shrink");
            try {
                const before = shrinkFile.size;
                const data = new Uint8Array(await shrinkFile.arrayBuffer());
                const pdfjsDoc = await pdfjsLib.getDocument({ data }).promise;
                const pages = pdfjsDoc.numPages;
                const manual = document.getElementById("opt-manual").checked;
                let blob, usedQ, usedDim, targetBytes = null;

                const pageMsg = label => (i, n) =>
                    showProgress("prog-shrink", (i-1)/n, `${label} — page ${i} of ${n}`);

                if (!manual){
                    targetBytes = Math.round(parseFloat(document.getElementById("opt-target").value || "10") * 1024 * 1024);
                    let lo = 0, hi = QUALITY_LADDER.length - 1, best = null;
                    while (lo <= hi){
                        const mid = (lo + hi) >> 1;
                        const [dim, q] = QUALITY_LADDER[mid];
                        const b = await shrinkOnce(pdfjsDoc, q, dim, pageMsg(`Trying quality ${q} @ ${dim}px`));
                        if (b.size <= targetBytes){ best = { blob: b, q, dim }; hi = mid - 1; }
                        else lo = mid + 1;
                    }
                    if (!best){
                        const [dim, q] = QUALITY_LADDER[QUALITY_LADDER.length - 1];
                        const b = await shrinkOnce(pdfjsDoc, q, dim, pageMsg(`Final pass, quality ${q} @ ${dim}px`));
                        best = { blob: b, q, dim };
                    }
                    ({ blob } = best); usedQ = best.q; usedDim = best.dim;
                } else {
                    usedQ = parseInt(document.getElementById("opt-quality").value, 10);
                    usedDim = parseInt(document.getElementById("opt-maxdim").value, 10);
                    blob = await shrinkOnce(pdfjsDoc, usedQ, usedDim, pageMsg(`Rendering, quality ${usedQ} @ ${usedDim}px`));
                }
                pdfjsDoc.destroy();

                const after = blob.size, saved = before - after;
                const base = shrinkFile.name.replace(/\.pdf$/i,"");
                const missedTarget = targetBytes && after > targetBytes;
                showResult("out-shrink", {
                    title: missedTarget ? "Shrunk as far as possible" : "Shrunk successfully",
                    stats: [
                        ["Pages", `${pages}`],
                        ["Before", humanSize(before)],
                        ["After", humanSize(after)],
                        ["Saved", saved > 0 ? `−${(saved/before*100).toFixed(1)}%` : "0%", saved > 0]
                    ],
                    detail: [
                        `Settings: JPEG quality ${usedQ}, max ${usedDim}px per page`,
                        missedTarget ? "Couldn't reach the target even at the lowest preset — this is the smallest result that keeps every page legible." : null,
                        saved <= 0 ? "The original was already smaller than a re-render at these settings." : null
                    ].filter(Boolean).join("\n"),
                    blob, name: `${base}_small.pdf`
                });
            } catch (err){
                showResult("out-shrink", { title: "Couldn't shrink this PDF", detail: String(err.message || err), error: true });
            } finally {
                hideProgress("prog-shrink");
                btn.disabled = false;
            }
        });
    }
});
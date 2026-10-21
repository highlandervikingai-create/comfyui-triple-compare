import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Builds a valid ComfyUI view URL for a given image descriptor object.
 */
function buildImageUrl(imgData) {
    if (!imgData) return "";
    if (typeof imgData === "string") return imgData;
    const filename = encodeURIComponent(imgData.filename || "");
    const subfolder = encodeURIComponent(imgData.subfolder || "");
    const type = encodeURIComponent(imgData.type || "temp");
    const route = `/view?filename=${filename}&type=${type}&subfolder=${subfolder}&t=${Date.now()}`;
    return api && typeof api.apiURL === "function" ? api.apiURL(route) : route;
}

app.registerExtension({
    name: "comfyui.triple_compare",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "TripleImageCompare") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                this.split = 0.5; // Single slider divider (normalized 0.0 to 1.0)
                this.activeSlider = false;
                this.hoverSlider = false;
                this.selected = [0, 1]; // Indices of selected images to compare (defaults to Image A & B)
                this.images = [null, null, null];
                this.imagesLoaded = [false, false, false];
                this.imgs = null;
                this.size = [512, 512];

                return r;
            };

            // Suppress ComfyUI's native background image preview tiling (which causes the 2x2 grid)
            nodeType.prototype.onDrawBackground = function (ctx) {
                this.imgs = null;
            };

            // Hook for receiving execution results from backend
            nodeType.prototype.onExecuted = function (message) {
                this.imgs = null; // Ensure ComfyUI does not populate internal imgs grid

                if (!message || !message.images || message.images.length < 3) return;

                const self = this;
                const descriptors = message.images;

                for (let i = 0; i < 3; i++) {
                    const idx = i;
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        self.images[idx] = img;
                        self.imagesLoaded[idx] = true;

                        if (self.imagesLoaded[0] && self.imagesLoaded[1] && self.imagesLoaded[2]) {
                            const imgW = self.images[0].naturalWidth || self.images[0].width || 512;
                            const imgH = self.images[0].naturalHeight || self.images[0].height || 512;
                            const aspect = imgW / (imgH || 1);
                            const currentWidth = self.size[0];
                            const targetMainH = Math.round(currentWidth / aspect);
                            const targetContentH = Math.round(targetMainH / 0.75); // 75% main window, 25% thumbnail strip
                            const topOffset = Math.max(30, (self.inputs ? self.inputs.length : 3) * 20 + 30);
                            self.size[1] = Math.max(340, targetContentH + topOffset);
                            self.setDirtyCanvas(true, true);
                        }
                    };
                    img.src = buildImageUrl(descriptors[idx]);
                }
            };

            // Custom foreground canvas renderer: Independent aspect-ratio contain mode for both comparison and thumbnails
            nodeType.prototype.onDrawForeground = function (ctx) {
                if (this.flags && this.flags.collapsed) return;

                const w = this.size[0];
                const h = this.size[1];

                if (w <= 0 || h <= 0) return;

                // Reserve top buffer for node title bar and input connection slots (image_a, image_b, image_c)
                const topOffset = Math.max(30, (this.inputs ? this.inputs.length : 3) * 20 + 30);
                const contentH = h - topOffset;

                if (contentH <= 0) return;

                // Layout: Top 75% main comparison window, Bottom 25% thumbnail selector strip
                const mainH = contentH * 0.75;
                const thumbH = contentH * 0.25;
                const thumbY = topOffset + mainH;
                const colW = w / 3;

                // Draw solid backdrop behind comparison area so nothing can bleed through
                ctx.save();
                ctx.fillStyle = "#12141a";
                ctx.fillRect(0, topOffset, w, contentH);
                ctx.restore();

                const labelNames = ["Image A", "Image B", "Image C"];

                if (this.imagesLoaded[0] && this.imagesLoaded[1] && this.imagesLoaded[2]) {
                    const selected = this.selected || [0, 1];
                    const sX = this.split * w;

                    // Helper to compute aspect-ratio locked ("contain") destination rectangle inside a viewport
                    function fitRect(srcW, srcH, maxW, maxH, offsetX, offsetY) {
                        const aspect = srcW / (srcH || 1);
                        const boxAspect = maxW / maxH;
                        let dw, dh, dx, dy;
                        if (boxAspect > aspect) {
                            dh = maxH;
                            dw = maxH * aspect;
                            dx = offsetX + (maxW - dw) / 2;
                            dy = offsetY;
                        } else {
                            dw = maxW;
                            dh = maxW / aspect;
                            dx = offsetX;
                            dy = offsetY + (maxH - dh) / 2;
                        }
                        return { x: dx, y: dy, w: dw, h: dh };
                    }

                    // --- 1. MAIN COMPARISON VIEW (Top 75%) ---
                    if (selected.length >= 2) {
                        const leftIdx = selected[0];
                        const rightIdx = selected[1];

                        const imgLeft = this.images[leftIdx];
                        const imgRight = this.images[rightIdx];

                        const lW = imgLeft.naturalWidth || imgLeft.width || 512;
                        const lH = imgLeft.naturalHeight || imgLeft.height || 512;
                        const rW = imgRight.naturalWidth || imgRight.width || 512;
                        const rH = imgRight.naturalHeight || imgRight.height || 512;

                        // Fit each image independently inside the (0, topOffset, w, mainH) viewport to lock native aspect ratio
                        const leftBox = fitRect(lW, lH, w, mainH, 0, topOffset);
                        const rightBox = fitRect(rW, rH, w, mainH, 0, topOffset);

                        // Left Image Slice: Clip from X=0 to X=sX
                        if (sX > 0) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(0, topOffset, sX, mainH);
                            ctx.clip();
                            ctx.drawImage(imgLeft, 0, 0, lW, lH, leftBox.x, leftBox.y, leftBox.w, leftBox.h);
                            ctx.restore();
                        }

                        // Right Image Slice: Clip from X=sX to X=w
                        if (w > sX) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(sX, topOffset, w - sX, mainH);
                            ctx.clip();
                            ctx.drawImage(imgRight, 0, 0, rW, rH, rightBox.x, rightBox.y, rightBox.w, rightBox.h);
                            ctx.restore();
                        }

                        // Single Neon Dividing Line & Draggable Handle at X=sX
                        const handleY = topOffset + mainH / 2;
                        const isHigh = (this.hoverSlider || this.activeSlider);

                        ctx.save();
                        ctx.shadowColor = "#00f0ff";
                        ctx.shadowBlur = isHigh ? 16 : 9;
                        ctx.strokeStyle = "#00f0ff";
                        ctx.lineWidth = isHigh ? 3.5 : 2.5;
                        ctx.beginPath();
                        ctx.moveTo(sX, topOffset);
                        ctx.lineTo(sX, thumbY);
                        ctx.stroke();

                        ctx.fillStyle = "#0a0e17";
                        ctx.beginPath();
                        ctx.arc(sX, handleY, isHigh ? 16 : 14, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();

                        // Inner arrow indicators (< >)
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = "#00f0ff";
                        ctx.beginPath();
                        ctx.moveTo(sX - 6, handleY);
                        ctx.lineTo(sX - 2, handleY - 4);
                        ctx.lineTo(sX - 2, handleY + 4);
                        ctx.closePath();
                        ctx.fill();

                        ctx.beginPath();
                        ctx.moveTo(sX + 6, handleY);
                        ctx.lineTo(sX + 2, handleY - 4);
                        ctx.lineTo(sX + 2, handleY + 4);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();

                        // Centered comparison badges anchored to topOffset
                        function drawBadge(text, centerX, accentColor) {
                            ctx.save();
                            ctx.font = "bold 11px sans-serif";
                            const tw = ctx.measureText(text).width;
                            const bw = tw + 16;
                            const bh = 22;
                            const by = topOffset + 12;
                            const bx = centerX - bw / 2;

                            ctx.fillStyle = "rgba(10, 14, 23, 0.88)";
                            ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
                            ctx.shadowBlur = 4;
                            ctx.beginPath();
                            ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 4) : ctx.rect(bx, by, bw, bh);
                            ctx.fill();

                            ctx.strokeStyle = accentColor;
                            ctx.lineWidth = 1.5;
                            ctx.stroke();

                            ctx.shadowBlur = 0;
                            ctx.fillStyle = "#f8fafc";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(text, centerX, by + bh / 2);
                            ctx.restore();
                        }

                        if (sX > 40) drawBadge(labelNames[leftIdx], sX / 2, "#00f0ff");
                        if (w - sX > 40) drawBadge(labelNames[rightIdx], sX + (w - sX) / 2, "#ffaa00");

                    } else if (selected.length === 1) {
                        const singleIdx = selected[0];
                        const img = this.images[singleIdx];
                        const sW = img.naturalWidth || img.width || 512;
                        const sH = img.naturalHeight || img.height || 512;
                        const singleBox = fitRect(sW, sH, w, mainH, 0, topOffset);

                        ctx.drawImage(img, 0, 0, sW, sH, singleBox.x, singleBox.y, singleBox.w, singleBox.h);

                        // Header instruction tag
                        ctx.save();
                        ctx.font = "bold 12px sans-serif";
                        const msg = `${labelNames[singleIdx]} (Click another thumbnail below to compare)`;
                        const tw = ctx.measureText(msg).width;
                        const bw = tw + 20;
                        const bh = 24;
                        const bx = w / 2 - bw / 2;
                        const by = topOffset + 12;

                        ctx.fillStyle = "rgba(10, 14, 23, 0.9)";
                        ctx.beginPath();
                        ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 4) : ctx.rect(bx, by, bw, bh);
                        ctx.fill();

                        ctx.fillStyle = "#00f0ff";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(msg, w / 2, by + bh / 2);
                        ctx.restore();
                    }

                    // --- 2. THUMBNAIL SELECTOR STRIP (Bottom 25% with Aspect-Ratio Lock) ---
                    ctx.save();
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, thumbY);
                    ctx.lineTo(w, thumbY);
                    ctx.stroke();
                    ctx.restore();

                    for (let i = 0; i < 3; i++) {
                        const thumbX = i * colW;
                        const tImg = this.images[i];
                        const tW = tImg.naturalWidth || tImg.width || 512;
                        const tH = tImg.naturalHeight || tImg.height || 512;

                        const isSelected = selected.includes(i);
                        const isLeft = (selected.length >= 2 && selected[0] === i) || (selected.length === 1 && selected[0] === i);

                        // Compute aspect-ratio locked destination for thumbnail inside cell (colW, thumbH)
                        const cellPad = 4;
                        const tBox = fitRect(tW, tH, colW - cellPad * 2, thumbH - cellPad * 2, thumbX + cellPad, thumbY + cellPad);

                        // Draw aspect-ratio locked thumbnail image
                        ctx.drawImage(tImg, 0, 0, tW, tH, tBox.x, tBox.y, tBox.w, tBox.h);

                        // Overlay & Border based on selection
                        ctx.save();
                        if (isSelected) {
                            const borderCol = isLeft ? "#00f0ff" : "#ffaa00";
                            ctx.shadowColor = borderCol;
                            ctx.shadowBlur = 8;
                            ctx.strokeStyle = borderCol;
                            ctx.lineWidth = 2.5;
                            ctx.strokeRect(tBox.x, tBox.y, tBox.w, tBox.h);

                            // Active slot badge
                            ctx.shadowBlur = 0;
                            ctx.fillStyle = borderCol;
                            ctx.beginPath();
                            const badgeTxt = isLeft ? `${labelNames[i]} [L]` : `${labelNames[i]} [R]`;
                            ctx.font = "bold 10px sans-serif";
                            const btw = ctx.measureText(badgeTxt).width + 8;
                            ctx.roundRect ? ctx.roundRect(tBox.x + 2, tBox.y + 2, btw, 16, 3) : ctx.rect(tBox.x + 2, tBox.y + 2, btw, 16);
                            ctx.fill();

                            ctx.fillStyle = "#000";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(badgeTxt, tBox.x + 2 + btw / 2, tBox.y + 10);

                        } else {
                            // Dimmed overlay for unselected thumbnail
                            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
                            ctx.fillRect(tBox.x, tBox.y, tBox.w, tBox.h);

                            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(tBox.x, tBox.y, tBox.w, tBox.h);

                            // Inactive label
                            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
                            ctx.font = "10px sans-serif";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(`${labelNames[i]} (Click)`, tBox.x + tBox.w / 2, tBox.y + tBox.h / 2);
                        }
                        ctx.restore();
                    }

                } else {
                    // Placeholder state before execution
                    ctx.save();
                    ctx.fillStyle = "#12141a";
                    ctx.fillRect(0, 0, w, h);

                    const sX = this.split * w;
                    ctx.strokeStyle = "rgba(0, 240, 255, 0.35)";
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(sX, topOffset); ctx.lineTo(sX, thumbY);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
                    ctx.font = "bold 14px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("Triple Image Comparer", w / 2, topOffset + mainH / 2 - 12);

                    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
                    ctx.font = "11px sans-serif";
                    ctx.fillText("Connect image_a, image_b, image_c & Queue Prompt", w / 2, topOffset + mainH / 2 + 14);

                    // Thumbnail strip placeholder
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
                    ctx.beginPath();
                    ctx.moveTo(0, thumbY); ctx.lineTo(w, thumbY);
                    ctx.moveTo(colW, thumbY); ctx.lineTo(colW, h);
                    ctx.moveTo(colW * 2, thumbY); ctx.lineTo(colW * 2, h);
                    ctx.stroke();
                    ctx.restore();
                }
            };

            // Mouse down handler: Supports both slider dragging and thumbnail selection
            nodeType.prototype.onMouseDown = function (e, localPos, graphCanvas) {
                const w = this.size[0];
                const h = this.size[1];
                const topOffset = Math.max(30, (this.inputs ? this.inputs.length : 3) * 20 + 30);
                const contentH = h - topOffset;
                const mainH = contentH * 0.75;
                const thumbY = topOffset + mainH;
                const colW = w / 3;

                // 1. Thumbnail Selector Click (Bottom 25%)
                if (localPos[1] >= thumbY && localPos[1] <= h && localPos[0] >= 0 && localPos[0] <= w) {
                    const clickedIdx = Math.min(2, Math.max(0, Math.floor(localPos[0] / colW)));
                    const selected = this.selected || [0, 1];

                    if (selected.includes(clickedIdx)) {
                        // If already selected and 2 are active, clicking deselects it
                        if (selected.length > 1) {
                            this.selected = selected.filter(i => i !== clickedIdx);
                        }
                    } else {
                        // Clicking an unselected thumbnail adds or rotates it in
                        if (selected.length < 2) {
                            this.selected.push(clickedIdx);
                        } else {
                            // Rotate: replace the second image
                            this.selected = [selected[0], clickedIdx];
                        }
                    }
                    this.selected.sort((a, b) => a - b);
                    this.setDirtyCanvas(true, true);
                    return true;
                }

                // 2. Main Comparison Slider Drag (Top 75%)
                if (this.selected && this.selected.length >= 2 && localPos[1] >= topOffset && localPos[1] < thumbY) {
                    const sX = this.split * w;
                    const hitTolerance = 22;
                    const d = Math.abs(localPos[0] - sX);

                    this.activeSlider = true;
                    if (d > hitTolerance) {
                        this.split = Math.max(0.01, Math.min(0.99, localPos[0] / w));
                    }
                    this.setDirtyCanvas(true, true);
                    return true;
                }

                return false;
            };

            // Mouse move handler
            nodeType.prototype.onMouseMove = function (e, localPos, graphCanvas) {
                const w = this.size[0];
                const h = this.size[1];
                const topOffset = Math.max(30, (this.inputs ? this.inputs.length : 3) * 20 + 30);
                const contentH = h - topOffset;
                const mainH = contentH * 0.75;
                const thumbY = topOffset + mainH;

                if (this.activeSlider) {
                    this.split = Math.max(0.01, Math.min(0.99, localPos[0] / w));
                    this.setDirtyCanvas(true, true);
                    return true;
                }

                if (this.selected && this.selected.length >= 2 && localPos[1] >= topOffset && localPos[1] < thumbY) {
                    const sX = this.split * w;
                    const hitTolerance = 18;
                    const d = Math.abs(localPos[0] - sX);
                    const newHover = (d <= hitTolerance);

                    if (newHover !== this.hoverSlider) {
                        this.hoverSlider = newHover;
                        this.setDirtyCanvas(true, true);
                    }
                } else if (this.hoverSlider) {
                    this.hoverSlider = false;
                    this.setDirtyCanvas(true, true);
                }

                return false;
            };

            // Mouse up handler
            nodeType.prototype.onMouseUp = function (e, localPos, graphCanvas) {
                if (this.activeSlider) {
                    this.activeSlider = false;
                    this.setDirtyCanvas(true, true);
                    return true;
                }
                return false;
            };
        }
    }
});
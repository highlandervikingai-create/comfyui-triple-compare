# ComfyUI Triple Image Comparer

An interactive, high-performance visual comparison node for **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** featuring a **Single-Slider Split View** and a **Selectable Thumbnail Deck**. Compare any combination of three images (A vs B, A vs C, or B vs C) in real time directly on the node canvas.

---

## Key Features

* **Single-Slider Precision Comparison**: A smooth, draggable vertical neon divider reveals fine pixel differences across any chosen pair of images with zero lag.
* **Click-to-Swap Thumbnail Deck (25% Dock)**:
  * Interactive bottom dock displays full previews of all three images (A, B, C) side-by-side.
  * **Click any thumbnail** to dynamically swap it into the active comparison view:
    * **Left Slot [L]**: Highlighted with an Electric Cyan (`#00f0ff`) glow and badge.
    * **Right Slot [R]**: Highlighted with a Warm Amber (`#ffaa00`) glow and badge.
    * **Direct A-to-C Comparison**: Effortlessly compare Image 1 and Image 3 with a single click.
* **Independent Native Aspect-Ratio Locking**:
  * Automatically calculates each input's native aspect ratio independently.
  * Mixed orientations (e.g. Portrait Image A vs. Landscape Image C) are displayed cleanly in "contain" mode with letterboxing—**never squeezed, stretched, or cropped**.
* **Clean Interface Architecture**:
  * Dedicated top buffer preserves full visibility and clickability for node title and input connection dots (`image_a`, `image_b`, `image_c`).
  * Suppresses ComfyUI's default 2x2 background image tiling, preventing ghost grids or overlapping elements.
  * Fluid scaling: Expand or resize the node freely without distorting image geometry.

---

## Installation

### Method 1: Git Clone (Recommended)

1. Open a terminal / command prompt in your ComfyUI installation directory.
2. Navigate to your `custom_nodes` folder:
   ```bash
   cd ComfyUI/custom_nodes
   ```
3. Clone this repository:
   ```bash
   git clone https://github.com/your-username/comfyui-triple-compare.git
   ```
4. Restart your ComfyUI server.

### Method 2: Manual / Portable Installation

1. Download or extract the `comfyui-triple-compare` folder.
2. Move it directly into your ComfyUI custom nodes directory:
   ```
   ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-triple-compare\
   ```
3. Ensure the folder contents match:
   ```
   comfyui-triple-compare/
   ├── __init__.py
   ├── triple_compare.py
   ├── README.md
   ├── LICENSE
   ├── .gitignore
   └── js/
       └── triple_compare.js
   ```
4. Restart ComfyUI and refresh your browser tab.

---

## How to Use

1. **Add the Node**: Double-click the canvas and search for **"Triple Image Comparer"** (or find it in the `image/comparison` category).
2. **Connect Inputs**: Connect three image outputs to `image_a`, `image_b`, and `image_c`.
3. **Queue Prompt**: Run your workflow.
4. **Compare**:
   * Drag the center slider handle left and right to reveal differences between the two active images.
   * Click any thumbnail in the bottom strip to swap images in and out of the comparison pane.
   * Double-click or resize the node corners to expand the preview to any custom dimensions.

---

## Technical Specifications

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Backend** | Python (`torch`, `PIL`, `numpy`) | Extracts native resolution tensors, caches fast PNG previews to `temp/`, and dispatches execution descriptors. |
| **Frontend** | JavaScript (ES Module, LiteGraph Canvas) | Renders the dual-deck canvas, computes independent aspect-ratio bounds, and drives single-slider drag interaction. |
| **Styling** | HTML5 Canvas 2D Context | High-contrast neon cyan/amber accents, pill badges, and non-blocking pointer listeners. |

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).

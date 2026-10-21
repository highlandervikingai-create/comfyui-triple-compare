"""
ComfyUI Triple Image Comparer Extension
---------------------------------------
Custom node package providing interactive three-way image comparison with dual draggable split sliders.
Repository / Node Folder: comfyui-triple-compare
"""

from .triple_compare import TripleImageCompare

# Map Python backend classes to internal node identifiers in ComfyUI
NODE_CLASS_MAPPINGS = {
    "TripleImageCompare": TripleImageCompare
}

# Map internal node identifiers to user-friendly display titles in the ComfyUI UI & search menu
NODE_DISPLAY_NAME_MAPPINGS = {
    "TripleImageCompare": "Triple Image Comparer"
}

# Specify the web directory for client-side JavaScript / CSS assets.
# ComfyUI's web server serves files in this directory to the frontend browser extension system.
WEB_DIRECTORY = "./js"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY"
]
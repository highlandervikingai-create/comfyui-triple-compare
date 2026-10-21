"""
Triple Image Comparer - Backend Node Implementation
----------------------------------------------------
Accepts three image inputs (image_a, image_b, image_c), preserves each input's
original aspect ratio and native resolution, saves lightweight preview assets
to ComfyUI's temporary directory, and returns a clean execution layout dictionary
{"ui": {"images": image_descriptors}} for the frontend comparison widget.
"""

import os
import time
import uuid
import numpy as np
from PIL import Image

# ComfyUI core environment imports
try:
    import torch
    import torch.nn.functional as F
except ImportError:
    torch = None
    F = None

try:
    import folder_paths
except ImportError:
    folder_paths = None


def resize_tensor_to_match(image_tensor, target_h: int, target_w: int):
    """
    Resizes an image tensor with shape [B, H, W, C] to match target spatial dimensions (target_h, target_w).
    Provided as an auxiliary utility function for workflows requiring strict uniform tensor shapes.
    """
    if torch is not None and isinstance(image_tensor, torch.Tensor):
        current_h = image_tensor.shape[1]
        current_w = image_tensor.shape[2]

        if current_h == target_h and current_w == target_w:
            return image_tensor

        permuted = image_tensor.permute(0, 3, 1, 2)
        resized = F.interpolate(
            permuted,
            size=(target_h, target_w),
            mode="bilinear",
            align_corners=False
        )
        return resized.permute(0, 2, 3, 1).clamp(0.0, 1.0)
    else:
        batch_size = image_tensor.shape[0]
        current_h = image_tensor.shape[1]
        current_w = image_tensor.shape[2]

        if current_h == target_h and current_w == target_w:
            return image_tensor

        resized_list = []
        for b in range(batch_size):
            arr = (np.clip(image_tensor[b], 0.0, 1.0) * 255.0).astype(np.uint8)
            pil_img = Image.fromarray(arr)
            pil_resized = pil_img.resize((target_w, target_h), Image.Resampling.BILINEAR)
            resized_list.append(np.array(pil_resized).astype(np.float32) / 255.0)

        return np.stack(resized_list, axis=0)


def tensor_to_pil(single_image_tensor) -> Image.Image:
    """
    Converts a single image tensor of shape [H, W, C] to a PIL Image.
    Scales float range [0.0, 1.0] to uint8 [0, 255].
    """
    if torch is not None and isinstance(single_image_tensor, torch.Tensor):
        arr = 255.0 * single_image_tensor.detach().cpu().numpy()
    else:
        arr = 255.0 * single_image_tensor

    arr = np.clip(arr, 0, 255).astype(np.uint8)

    # Handle grayscale, RGB, and RGBA channels
    if arr.ndim == 2 or (arr.ndim == 3 and arr.shape[-1] == 1):
        return Image.fromarray(arr.squeeze(-1) if arr.ndim == 3 else arr, mode="L")
    elif arr.shape[-1] == 4:
        return Image.fromarray(arr, mode="RGBA")
    else:
        return Image.fromarray(arr, mode="RGB")


class TripleImageCompare:
    """
    ComfyUI Node: Triple Image Comparer
    -----------------------------------
    Inputs:
        image_a (IMAGE): First comparison image input.
        image_b (IMAGE): Second comparison image input.
        image_c (IMAGE): Third comparison image input.
    
    Execution:
        - Safely extracts dimensions while securing each image's native aspect ratio.
        - Saves lightweight preview PNGs to ComfyUI's temporary directory.
        - Returns a clean execution layout dictionary: {"ui": {"images": image_descriptors}}.
    """

    def __init__(self):
        self.type = "temp"
        self.compress_level = 1  # Fast compression for snappy UI preview generation

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_a": ("IMAGE", {"tooltip": "First comparison image input."}),
                "image_b": ("IMAGE", {"tooltip": "Second comparison image input."}),
                "image_c": ("IMAGE", {"tooltip": "Third comparison image input."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "compare_images"
    CATEGORY = "image/comparison"

    def compare_images(self, image_a, image_b, image_c, unique_id=None, prompt=None, extra_pnginfo=None):
        """
        Main execution method for the Triple Image Comparer node.
        Secures each input's original aspect ratio without distortion.
        """
        # Step 1: Safely extract spatial dimensions from image_a using shape[1] and shape[2]
        target_h = image_a.shape[1]
        target_w = image_a.shape[2]

        # Step 2: Determine temporary directory path
        if folder_paths is not None:
            temp_dir = folder_paths.get_temp_directory()
        else:
            temp_dir = os.path.join(os.path.expanduser("~"), ".comfy_temp")
        os.makedirs(temp_dir, exist_ok=True)

        # Generate unique filenames for this execution to prevent browser cache collision
        run_token = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
        filename_a = f"triple_comp_{run_token}_a.png"
        filename_b = f"triple_comp_{run_token}_b.png"
        filename_c = f"triple_comp_{run_token}_c.png"

        # Step 3: Safely extract the 0-index frame from each batch tensor in its NATIVE aspect ratio
        pil_a = tensor_to_pil(image_a[0])
        pil_b = tensor_to_pil(image_b[0])
        pil_c = tensor_to_pil(image_c[0])

        pil_a.save(os.path.join(temp_dir, filename_a), compress_level=self.compress_level)
        pil_b.save(os.path.join(temp_dir, filename_b), compress_level=self.compress_level)
        pil_c.save(os.path.join(temp_dir, filename_c), compress_level=self.compress_level)

        # Step 4: Construct image descriptor list for ComfyUI /view API
        image_descriptors = [
            {"filename": filename_a, "subfolder": "", "type": self.type},
            {"filename": filename_b, "subfolder": "", "type": self.type},
            {"filename": filename_c, "subfolder": "", "type": self.type},
        ]

        # Step 5: Return clean execution dictionary matching frontend expectations
        return {"ui": {"images": image_descriptors}}
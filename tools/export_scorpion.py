import bpy
import os
import sys

# ARENA3D build-time conversion:
# Source: GuieA_7 / Guillaume "GuieA_7" Englert
# OpenGameArt: https://opengameart.org/content/scorpion-3d
# License: CC-BY-SA 4.0

args = sys.argv
if "--" not in args:
    raise SystemExit("Missing -- arguments.")

args = args[args.index("--") + 1:]
output = None
for i, arg in enumerate(args):
    if arg == "--output" and i + 1 < len(args):
        output = args[i + 1]
        break

if not output:
    raise SystemExit("Missing --output path.")

output = os.path.abspath(output)
os.makedirs(os.path.dirname(output), exist_ok=True)

for obj in list(bpy.context.scene.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.select_all(action="SELECT")
for obj in bpy.context.selected_objects:
    obj.hide_render = False
    obj.hide_viewport = False

bpy.ops.export_scene.gltf(
    filepath=output,
    export_format="GLB",
    export_animations=True,
    export_nla_strips=True,
    export_all_influences=True,
    export_image_format="AUTO",
    export_apply=True,
)

if not os.path.isfile(output) or os.path.getsize(output) < 1000:
    raise SystemExit("GLB export failed or produced an invalidly small file.")

print("SCORPION GLB:", output, os.path.getsize(output), "bytes")

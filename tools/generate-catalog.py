#!/usr/bin/env python3
"""
Generate 100 McMaster-Carr-style product schemas for the v4 parametric design platform.
Each product is a JSON schema with declarative geometry — no JS files needed.

Usage: python3 tools/generate-catalog.py
"""

import json
import os

SCHEMA_DIR = os.path.join(os.path.dirname(__file__), '..', 'schemas')

# ─── Shared Lookup Table Data ──────────────────────────────────────────

ISO_SIZES = ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"]
ISO_PITCH = {"M2": 0.4, "M2.5": 0.45, "M3": 0.5, "M4": 0.7, "M5": 0.8, "M6": 1.0, "M8": 1.25, "M10": 1.5, "M12": 1.75, "M16": 2.0, "M20": 2.5}
ISO_MAJOR = {"M2": 2.0, "M2.5": 2.5, "M3": 3.0, "M4": 4.0, "M5": 5.0, "M6": 6.0, "M8": 8.0, "M10": 10.0, "M12": 12.0, "M16": 16.0, "M20": 20.0}

# Hex bolt/nut across-flats (ISO 4032/4014)
ISO_HEX_AF = {"M2": 4.0, "M2.5": 5.0, "M3": 5.5, "M4": 7.0, "M5": 8.0, "M6": 10.0, "M8": 13.0, "M10": 16.0, "M12": 18.0, "M16": 24.0, "M20": 30.0}
ISO_HEX_HEAD_H = {"M2": 1.4, "M2.5": 1.7, "M3": 2.0, "M4": 2.8, "M5": 3.5, "M6": 4.0, "M8": 5.3, "M10": 6.4, "M12": 7.5, "M16": 10.0, "M20": 12.5}
ISO_NUT_H = {"M2": 1.6, "M2.5": 2.0, "M3": 2.4, "M4": 3.2, "M5": 4.7, "M6": 5.2, "M8": 6.8, "M10": 8.4, "M12": 10.8, "M16": 14.8, "M20": 18.0}

# Socket head cap screw (ISO 4762)
ISO_SHCS_HEAD_D = {"M2": 3.8, "M2.5": 4.5, "M3": 5.5, "M4": 7.0, "M5": 8.5, "M6": 10.0, "M8": 13.0, "M10": 16.0, "M12": 18.0, "M16": 24.0, "M20": 30.0}
ISO_SHCS_HEAD_H = {"M2": 2.0, "M2.5": 2.5, "M3": 3.0, "M4": 4.0, "M5": 5.0, "M6": 6.0, "M8": 8.0, "M10": 10.0, "M12": 12.0, "M16": 16.0, "M20": 20.0}

# Button head (ISO 7380)
ISO_BHCS_HEAD_D = {"M2": 3.5, "M2.5": 4.5, "M3": 5.7, "M4": 7.6, "M5": 9.5, "M6": 10.5, "M8": 14.0, "M10": 17.5, "M12": 21.0, "M16": 28.0, "M20": 35.0}
ISO_BHCS_HEAD_H = {"M2": 1.0, "M2.5": 1.25, "M3": 1.65, "M4": 2.2, "M5": 2.75, "M6": 3.3, "M8": 4.4, "M10": 5.5, "M12": 6.6, "M16": 8.8, "M20": 11.0}

# Flat head (ISO 10642)
ISO_FHCS_HEAD_D = {"M2": 3.8, "M2.5": 4.7, "M3": 6.0, "M4": 8.0, "M5": 10.0, "M6": 12.0, "M8": 16.0, "M10": 20.0, "M12": 24.0, "M16": 30.0, "M20": 36.0}

# Washer dimensions (ISO 7089 normal, ISO 7093 large)
ISO_WASHER_ID = {"M2": 2.2, "M2.5": 2.7, "M3": 3.2, "M4": 4.3, "M5": 5.3, "M6": 6.4, "M8": 8.4, "M10": 10.5, "M12": 13.0, "M16": 17.0, "M20": 21.0}
ISO_WASHER_OD = {"M2": 5.0, "M2.5": 6.0, "M3": 7.0, "M4": 9.0, "M5": 10.0, "M6": 12.0, "M8": 16.0, "M10": 20.0, "M12": 24.0, "M16": 30.0, "M20": 37.0}
ISO_WASHER_T = {"M2": 0.3, "M2.5": 0.5, "M3": 0.5, "M4": 0.8, "M5": 1.0, "M6": 1.6, "M8": 1.6, "M10": 2.0, "M12": 2.5, "M16": 3.0, "M20": 3.0}
ISO_WASHER_OD_LARGE = {"M2": 7.0, "M2.5": 8.0, "M3": 9.0, "M4": 12.0, "M5": 15.0, "M6": 18.0, "M8": 24.0, "M10": 30.0, "M12": 37.0, "M16": 50.0, "M20": 60.0}

# Inch sizes
INCH_SIZES = ["#4", "#6", "#8", "#10", "1/4", "5/16", "3/8", "7/16", "1/2", "5/8", "3/4"]
INCH_MAJOR = {"#4": 2.845, "#6": 3.505, "#8": 4.166, "#10": 4.826, "1/4": 6.35, "5/16": 7.938, "3/8": 9.525, "7/16": 11.112, "1/2": 12.7, "5/8": 15.875, "3/4": 19.05}
INCH_UNC_PITCH = {"#4": 0.635, "#6": 0.794, "#8": 0.794, "#10": 1.058, "1/4": 1.27, "5/16": 1.411, "3/8": 1.588, "7/16": 1.814, "1/2": 1.954, "5/8": 2.309, "3/4": 2.54}
INCH_HEX_AF = {"#4": 6.35, "#6": 7.938, "#8": 8.731, "#10": 9.525, "1/4": 11.113, "5/16": 12.7, "3/8": 14.288, "7/16": 15.875, "1/2": 19.05, "5/8": 23.813, "3/4": 28.575}
INCH_HEX_HEAD_H = {"#4": 2.0, "#6": 2.4, "#8": 2.8, "#10": 3.2, "1/4": 4.0, "5/16": 5.1, "3/8": 6.0, "7/16": 7.0, "1/2": 8.0, "5/8": 10.0, "3/4": 12.0}
INCH_NUT_H = {"#4": 2.4, "#6": 2.8, "#8": 3.3, "#10": 3.6, "1/4": 5.6, "5/16": 6.9, "3/8": 8.3, "7/16": 9.5, "1/2": 11.1, "5/8": 13.5, "3/4": 16.7}
INCH_WASHER_SAE_ID = {"#4": 3.2, "#6": 3.7, "#8": 4.4, "#10": 5.1, "1/4": 7.1, "5/16": 8.7, "3/8": 10.3, "7/16": 11.9, "1/2": 13.5, "5/8": 17.5, "3/4": 20.6}
INCH_WASHER_SAE_OD = {"#4": 7.9, "#6": 9.5, "#8": 11.1, "#10": 12.7, "1/4": 15.9, "5/16": 17.5, "3/8": 20.6, "7/16": 22.2, "1/2": 25.4, "5/8": 34.9, "3/4": 38.1}
INCH_WASHER_SAE_T = {"#4": 0.8, "#6": 0.8, "#8": 1.2, "#10": 1.2, "1/4": 1.6, "5/16": 1.6, "3/8": 2.0, "7/16": 2.0, "1/2": 2.4, "5/8": 2.4, "3/4": 3.2}

# Pin/dowel diameters
PIN_DIAMETERS = {"1": 1.0, "1.5": 1.5, "2": 2.0, "2.5": 2.5, "3": 3.0, "4": 4.0, "5": 5.0, "6": 6.0, "8": 8.0, "10": 10.0, "12": 12.0}

# Bushing standard sizes (ID x OD)
BUSHING_SIZES = ["4x6", "5x8", "6x10", "8x12", "10x14", "12x16", "14x18", "16x20", "20x25"]
BUSHING_ID = {"4x6": 4, "5x8": 5, "6x10": 6, "8x12": 8, "10x14": 10, "12x16": 12, "14x18": 14, "16x20": 16, "20x25": 20}
BUSHING_OD = {"4x6": 6, "5x8": 8, "6x10": 10, "8x12": 12, "10x14": 14, "12x16": 16, "14x18": 18, "16x20": 20, "20x25": 25}

# Pipe sizes (nominal bore mm)
PIPE_SIZES = ["6", "8", "10", "15", "20", "25", "32", "40", "50"]
PIPE_OD = {"6": 10.2, "8": 13.5, "10": 17.2, "15": 21.3, "20": 26.9, "25": 33.7, "32": 42.4, "40": 48.3, "50": 60.3}
PIPE_WALL = {"6": 1.8, "8": 2.0, "10": 2.0, "15": 2.3, "20": 2.3, "25": 2.6, "32": 2.6, "40": 2.6, "50": 2.9}


# ─── Schema Generators ────────────────────────────────────────────────

def make_schema(id, name, desc, category, tags, parameters, derived, constants, geometry, groups, presets):
    schema = {"id": id, "name": name, "version": "1.0.0", "description": desc}
    schema["parameters"] = parameters
    schema["derived"] = derived
    if constants:
        schema["constants"] = constants
    schema["geometry"] = geometry
    schema["groups"] = groups
    schema["presets"] = presets
    return schema


def metric_bolt_like(id, name, desc, tags, head_type, head_d_table, head_h_table, head_geo):
    """Generic metric bolt/screw with size + length params."""
    return make_schema(
        id=id, name=name, desc=desc, category="fasteners", tags=tags,
        parameters={
            "size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M6", "group": "dimensions"},
            "length": {"label": "Length", "default": 20, "min": 5, "max": 150, "step": 1, "unit": "mm", "group": "dimensions"},
        },
        derived={
            "pitch": {"formula": "ISO_PITCH[size]", "description": "Thread pitch"},
            "major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Nominal diameter"},
            "shank_radius": {"formula": "major_diameter / 2", "description": "Shank radius"},
            "head_diameter": {"formula": "HEAD_DIA[size]", "description": "Head diameter"},
            "head_radius": {"formula": "head_diameter / 2", "description": "Head radius"},
            "head_height": {"formula": "HEAD_HEIGHT[size]", "description": "Head height"},
        },
        constants={
            "ISO_PITCH": ISO_PITCH, "ISO_MAJOR": ISO_MAJOR,
            "HEAD_DIA": head_d_table, "HEAD_HEIGHT": head_h_table,
        },
        geometry={
            "shank": {"type": "cylinder", "radius": "shank_radius", "height": "length", "position": [0, "-length / 2", 0]},
            "head": head_geo,
        },
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={
            "m6x20": {"label": "M6x20", "values": {"size": "M6", "length": 20}},
            "m8x30": {"label": "M8x30", "values": {"size": "M8", "length": 30}},
            "m10x40": {"label": "M10x40", "values": {"size": "M10", "length": 40}},
        }
    )


def nut_like(id, name, desc, tags, height_table, height_formula="NUT_HEIGHT[size]", extra_geo=None):
    geo = {"body": {"type": "polygon", "sides": 6, "radius": "outer_radius", "height": "nut_height", "bore": "bore_radius"}}
    if extra_geo:
        geo.update(extra_geo)
    return make_schema(
        id=id, name=name, desc=desc, category="fasteners", tags=tags,
        parameters={"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M6", "group": "dimensions"}},
        derived={
            "pitch": {"formula": "ISO_PITCH[size]", "description": "Thread pitch"},
            "major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Nominal diameter"},
            "nut_af": {"formula": "ISO_HEX_AF[size]", "description": "Width across flats"},
            "nut_height": {"formula": height_formula, "description": "Nut height"},
            "outer_radius": {"formula": "nut_af / sqrt(3)", "description": "Circumscribed radius"},
            "bore_radius": {"formula": "major_diameter / 2", "description": "Bore radius"},
        },
        constants={"ISO_PITCH": ISO_PITCH, "ISO_MAJOR": ISO_MAJOR, "ISO_HEX_AF": ISO_HEX_AF, "NUT_HEIGHT": height_table},
        geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"m6": {"label": "M6", "values": {"size": "M6"}}, "m8": {"label": "M8", "values": {"size": "M8"}}, "m10": {"label": "M10", "values": {"size": "M10"}}},
    )


def washer(id, name, desc, tags, sizes, id_table, od_table, t_table):
    return make_schema(
        id=id, name=name, desc=desc, category="fasteners", tags=tags,
        parameters={"size": {"label": "Size", "type": "select", "options": sizes, "default": sizes[5] if len(sizes) > 5 else sizes[0], "group": "dimensions"}},
        derived={
            "washer_id": {"formula": "WASHER_ID[size]", "description": "Inner diameter"},
            "washer_od": {"formula": "WASHER_OD[size]", "description": "Outer diameter"},
            "thickness": {"formula": "WASHER_T[size]", "description": "Thickness"},
            "inner_radius": {"formula": "washer_id / 2", "description": "Inner radius"},
            "outer_radius": {"formula": "washer_od / 2", "description": "Outer radius"},
        },
        constants={"WASHER_ID": id_table, "WASHER_OD": od_table, "WASHER_T": t_table},
        geometry={"body": {"type": "cylinder", "radius": "outer_radius", "height": "thickness", "bore": "inner_radius", "segments": 32}},
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={f"p{i}": {"label": sizes[i], "values": {"size": sizes[i]}} for i in [2, 5, 8] if i < len(sizes)},
    )


def pin(id, name, desc, tags, geo_type="cylinder", extra_params=None, extra_derived=None, geo_override=None):
    params = {
        "diameter": {"label": "Diameter", "type": "select", "options": list(PIN_DIAMETERS.keys()), "default": "6", "group": "dimensions"},
        "length": {"label": "Length", "default": 20, "min": 5, "max": 100, "step": 1, "unit": "mm", "group": "dimensions"},
    }
    if extra_params: params.update(extra_params)
    derived = {
        "pin_diameter": {"formula": "PIN_DIA[diameter]", "description": "Pin diameter"},
        "radius": {"formula": "pin_diameter / 2", "description": "Pin radius"},
    }
    if extra_derived: derived.update(extra_derived)
    geo = geo_override or {"body": {"type": geo_type, "radius": "radius", "height": "length"}}
    return make_schema(
        id=id, name=name, desc=desc, category="pins", tags=tags,
        parameters=params, derived=derived,
        constants={"PIN_DIA": PIN_DIAMETERS},
        geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"d6x20": {"label": "6x20", "values": {"diameter": "6", "length": 20}}, "d8x30": {"label": "8x30", "values": {"diameter": "8", "length": 30}}},
    )


def bushing(id, name, desc, tags, has_flange=False):
    derived = {
        "inner_radius": {"formula": "B_ID[size] / 2", "description": "Inner radius"},
        "outer_radius": {"formula": "B_OD[size] / 2", "description": "Outer radius"},
    }
    geo = {"body": {"type": "cylinder", "radius": "outer_radius", "height": "length", "bore": "inner_radius", "segments": 32}}
    if has_flange:
        derived["flange_radius"] = {"formula": "outer_radius * 1.4", "description": "Flange radius"}
        derived["flange_height"] = {"formula": "length * 0.15", "description": "Flange height"}
        geo["flange"] = {"type": "cylinder", "radius": "flange_radius", "height": "flange_height", "bore": "inner_radius", "segments": 32, "position": [0, "length / 2 + flange_height / 2", 0]}
    return make_schema(
        id=id, name=name, desc=desc, category="bushings", tags=tags,
        parameters={
            "size": {"label": "Size (IDxOD)", "type": "select", "options": BUSHING_SIZES, "default": "8x12", "group": "dimensions"},
            "length": {"label": "Length", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
        },
        derived=derived,
        constants={"B_ID": BUSHING_ID, "B_OD": BUSHING_OD},
        geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"s1": {"label": "8x12x10", "values": {"size": "8x12", "length": 10}}, "s2": {"label": "10x14x15", "values": {"size": "10x14", "length": 15}}},
    )


def bar_stock(id, name, desc, tags, shape):
    if shape == "round":
        params = {
            "diameter": {"label": "Diameter", "default": 10, "min": 2, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {"radius": {"formula": "diameter / 2", "description": "Radius"}}
        geo = {"body": {"type": "cylinder", "radius": "radius", "height": "length"}}
    elif shape == "hex":
        params = {
            "af": {"label": "Across Flats", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {"radius": {"formula": "af / sqrt(3)", "description": "Circumscribed radius"}}
        geo = {"body": {"type": "polygon", "sides": 6, "radius": "radius", "height": "length"}}
    elif shape == "square":
        params = {
            "side": {"label": "Side Length", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {}
        geo = {"body": {"type": "box", "width": "side", "depth": "side", "height": "length"}}
    elif shape == "flat":
        params = {
            "bar_width": {"label": "Width", "default": 25, "min": 5, "max": 100, "step": 1, "unit": "mm", "group": "dimensions"},
            "bar_thickness": {"label": "Thickness", "default": 3, "min": 1, "max": 20, "step": 0.5, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 100, "min": 10, "max": 500, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {}
        geo = {"body": {"type": "box", "width": "bar_width", "depth": "bar_thickness", "height": "length"}}
    else:
        return None
    return make_schema(
        id=id, name=name, desc=desc, category="structural", tags=tags,
        parameters=params, derived=derived, constants=None, geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"default": {"label": "Default", "values": {}}},
    )


def tube_stock(id, name, desc, tags, shape):
    if shape == "round":
        params = {
            "od": {"label": "Outer Diameter", "default": 20, "min": 4, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"},
            "wall": {"label": "Wall Thickness", "default": 2, "min": 0.5, "max": 10, "step": 0.5, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {
            "outer_radius": {"formula": "od / 2", "description": "Outer radius"},
            "inner_radius": {"formula": "od / 2 - wall", "description": "Inner radius"},
        }
        geo = {"body": {"type": "cylinder", "radius": "outer_radius", "height": "length", "bore": "inner_radius", "segments": 32}}
    elif shape == "square":
        params = {
            "side": {"label": "Side Length", "default": 20, "min": 5, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"},
            "wall": {"label": "Wall Thickness", "default": 2, "min": 0.5, "max": 8, "step": 0.5, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {}
        geo = {"body": {"type": "box", "width": "side", "depth": "side", "height": "length", "shell": "wall"}}
    elif shape == "rectangular":
        params = {
            "tube_width": {"label": "Width", "default": 30, "min": 5, "max": 100, "step": 1, "unit": "mm", "group": "dimensions"},
            "tube_height": {"label": "Height", "default": 20, "min": 5, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"},
            "wall": {"label": "Wall Thickness", "default": 2, "min": 0.5, "max": 8, "step": 0.5, "unit": "mm", "group": "dimensions"},
            "length": {"label": "Length", "default": 50, "min": 10, "max": 300, "step": 5, "unit": "mm", "group": "dimensions"},
        }
        derived = {}
        geo = {"body": {"type": "box", "width": "tube_width", "depth": "tube_height", "height": "length", "shell": "wall"}}
    else:
        return None
    return make_schema(
        id=id, name=name, desc=desc, category="structural", tags=tags,
        parameters=params, derived=derived, constants=None, geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"default": {"label": "Default", "values": {}}},
    )


def bracket(id, name, desc, tags, geo):
    params = {
        "bracket_width": {"label": "Width", "default": 30, "min": 10, "max": 80, "step": 5, "unit": "mm", "group": "dimensions"},
        "bracket_height": {"label": "Height", "default": 50, "min": 15, "max": 150, "step": 5, "unit": "mm", "group": "dimensions"},
        "bracket_depth": {"label": "Depth", "default": 50, "min": 15, "max": 150, "step": 5, "unit": "mm", "group": "dimensions"},
        "thickness": {"label": "Thickness", "default": 3, "min": 1, "max": 10, "step": 0.5, "unit": "mm", "group": "dimensions"},
    }
    return make_schema(
        id=id, name=name, desc=desc, category="structural", tags=tags,
        parameters=params, derived={}, constants=None, geometry=geo,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"default": {"label": "Default", "values": {}}},
    )


def pipe_fitting(id, name, desc, tags, geo_func):
    return make_schema(
        id=id, name=name, desc=desc, category="pipe-fittings", tags=tags,
        parameters={
            "nominal": {"label": "Nominal Bore", "type": "select", "options": PIPE_SIZES, "default": "20", "group": "dimensions"},
            "length": {"label": "Length", "default": 30, "min": 10, "max": 150, "step": 5, "unit": "mm", "group": "dimensions"},
        },
        derived={
            "pipe_od": {"formula": "PIPE_OD[nominal]", "description": "Outside diameter"},
            "pipe_wall": {"formula": "PIPE_WALL[nominal]", "description": "Wall thickness"},
            "outer_radius": {"formula": "pipe_od / 2", "description": "Outer radius"},
            "inner_radius": {"formula": "pipe_od / 2 - pipe_wall", "description": "Inner radius"},
        },
        constants={"PIPE_OD": PIPE_OD, "PIPE_WALL": PIPE_WALL},
        geometry=geo_func,
        groups={"dimensions": {"label": "Dimensions", "order": 1}},
        presets={"dn20": {"label": "DN20", "values": {"nominal": "20"}}, "dn25": {"label": "DN25", "values": {"nominal": "25"}}},
    )


def simple_product(id, name, desc, category, tags, params, derived, constants, geometry, presets):
    return make_schema(id=id, name=name, desc=desc, category=category, tags=tags,
                       parameters=params, derived=derived, constants=constants, geometry=geometry,
                       groups={"dimensions": {"label": "Dimensions", "order": 1}},
                       presets=presets)


# ─── Product Definitions ──────────────────────────────────────────────

products = []

# === METRIC BOLTS & SCREWS ===
products.append(metric_bolt_like("metric-hex-bolt", "Metric Hex Bolt", "ISO 4014 hex head bolt", ["iso", "metric", "bolt", "hex"],
    "hex", ISO_HEX_AF, ISO_HEX_HEAD_H,
    {"type": "polygon", "sides": 6, "radius": "head_diameter / sqrt(3)", "height": "head_height", "position": [0, "head_height / 2", 0]}))

products.append(metric_bolt_like("metric-button-head-screw", "Metric Button Head Screw", "ISO 7380 button head socket cap screw", ["iso", "metric", "screw", "button-head"],
    "button", ISO_BHCS_HEAD_D, ISO_BHCS_HEAD_H,
    {"type": "cylinder", "radius": "head_radius", "height": "head_height", "position": [0, "head_height / 2", 0]}))

products.append(metric_bolt_like("metric-flat-head-screw", "Metric Flat Head Screw", "ISO 10642 flat head socket cap screw", ["iso", "metric", "screw", "flat-head", "countersunk"],
    "flat", ISO_FHCS_HEAD_D, {"M2": 1.2, "M2.5": 1.5, "M3": 1.7, "M4": 2.3, "M5": 2.8, "M6": 3.3, "M8": 4.4, "M10": 5.5, "M12": 6.5, "M16": 8.0, "M20": 10.0},
    {"type": "cone", "radiusTop": "shank_radius", "radiusBottom": "head_radius", "height": "head_height", "position": [0, "head_height / 2", 0]}))

products.append(simple_product("metric-set-screw-cup", "Metric Set Screw (Cup Point)", "ISO 4029 cup point set screw", "fasteners", ["iso", "metric", "set-screw"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M6", "group": "dimensions"},
     "length": {"label": "Length", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"body": {"type": "cylinder", "radius": "radius", "height": "length"}},
    {"m6x10": {"label": "M6x10", "values": {"size": "M6", "length": 10}}}))

products.append(simple_product("metric-set-screw-flat", "Metric Set Screw (Flat Point)", "ISO 4027 flat point set screw", "fasteners", ["iso", "metric", "set-screw"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M6", "group": "dimensions"},
     "length": {"label": "Length", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"body": {"type": "cylinder", "radius": "radius", "height": "length"}},
    {"m6x10": {"label": "M6x10", "values": {"size": "M6", "length": 10}}}))

products.append(simple_product("metric-shoulder-bolt", "Metric Shoulder Bolt", "ISO 7379 shoulder bolt", "fasteners", ["iso", "metric", "shoulder-bolt"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES[:9], "default": "M6", "group": "dimensions"},
     "shoulder_length": {"label": "Shoulder Length", "default": 20, "min": 5, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"},
     "shoulder_dia": {"label": "Shoulder Diameter", "default": 10, "min": 4, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Thread diameter"}, "thread_radius": {"formula": "major_diameter / 2", "description": "Thread radius"},
     "shoulder_radius": {"formula": "shoulder_dia / 2", "description": "Shoulder radius"},
     "head_diameter": {"formula": "ISO_SHCS_HEAD_D[size]", "description": "Head diameter"}, "head_radius": {"formula": "head_diameter / 2", "description": "Head radius"},
     "head_height": {"formula": "ISO_SHCS_HEAD_H[size]", "description": "Head height"},
     "thread_length": {"formula": "major_diameter * 1.5", "description": "Thread length"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH, "ISO_SHCS_HEAD_D": ISO_SHCS_HEAD_D, "ISO_SHCS_HEAD_H": ISO_SHCS_HEAD_H},
    {"head": {"type": "cylinder", "radius": "head_radius", "height": "head_height", "position": [0, "head_height / 2", 0]},
     "shoulder": {"type": "cylinder", "radius": "shoulder_radius", "height": "shoulder_length", "position": [0, "-shoulder_length / 2", 0]},
     "thread": {"type": "cylinder", "radius": "thread_radius", "height": "thread_length", "position": [0, "-shoulder_length - thread_length / 2", 0]}},
    {"m6": {"label": "M6x20", "values": {"size": "M6", "shoulder_length": 20, "shoulder_dia": 10}}}))

products.append(simple_product("metric-stud", "Metric Stud Bolt", "Double-ended metric threaded stud", "fasteners", ["iso", "metric", "stud"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M8", "group": "dimensions"},
     "length": {"label": "Length", "default": 50, "min": 20, "max": 200, "step": 5, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"body": {"type": "cylinder", "radius": "radius", "height": "length"}},
    {"m8x50": {"label": "M8x50", "values": {"size": "M8", "length": 50}}}))

products.append(simple_product("metric-threaded-rod", "Metric Threaded Rod", "Fully threaded metric rod", "fasteners", ["iso", "metric", "threaded-rod"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES, "default": "M8", "group": "dimensions"},
     "length": {"label": "Length", "default": 100, "min": 20, "max": 500, "step": 10, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"body": {"type": "cylinder", "radius": "radius", "height": "length"}},
    {"m8x100": {"label": "M8x100", "values": {"size": "M8", "length": 100}}}))

products.append(simple_product("metric-thumb-screw", "Metric Thumb Screw", "Knurled head thumb screw", "fasteners", ["metric", "thumb-screw"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES[:9], "default": "M4", "group": "dimensions"},
     "length": {"label": "Length", "default": 12, "min": 5, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "head_dia": {"formula": "major_diameter * 3", "description": "Head diameter"}, "head_radius": {"formula": "head_dia / 2", "description": "Head radius"},
     "head_height": {"formula": "major_diameter * 0.8", "description": "Head height"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"shank": {"type": "cylinder", "radius": "radius", "height": "length", "position": [0, "-length / 2", 0]},
     "head": {"type": "cylinder", "radius": "head_radius", "height": "head_height", "segments": 24, "position": [0, "head_height / 2", 0]}},
    {"m4x12": {"label": "M4x12", "values": {"size": "M4", "length": 12}}}))

products.append(simple_product("metric-carriage-bolt", "Metric Carriage Bolt", "Round head square neck carriage bolt", "fasteners", ["metric", "carriage-bolt"],
    {"size": {"label": "Metric Size", "type": "select", "options": ISO_SIZES[2:9], "default": "M6", "group": "dimensions"},
     "length": {"label": "Length", "default": 30, "min": 10, "max": 150, "step": 5, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "head_dia": {"formula": "major_diameter * 1.75", "description": "Head diameter"}, "head_radius": {"formula": "head_dia / 2", "description": "Head radius"},
     "head_height": {"formula": "major_diameter * 0.6", "description": "Head height"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": ISO_MAJOR, "ISO_PITCH": ISO_PITCH},
    {"shank": {"type": "cylinder", "radius": "radius", "height": "length", "position": [0, "-length / 2", 0]},
     "head": {"type": "sphere", "radius": "head_radius", "position": [0, "head_height * 0.2", 0]}},
    {"m6x30": {"label": "M6x30", "values": {"size": "M6", "length": 30}}}))

# Inch bolts
products.append(metric_bolt_like("inch-hex-bolt", "Inch Hex Bolt", "SAE hex bolt (UNC)", ["inch", "sae", "bolt", "hex"],
    "hex", INCH_HEX_AF, INCH_HEX_HEAD_H,
    {"type": "polygon", "sides": 6, "radius": "head_diameter / sqrt(3)", "height": "head_height", "position": [0, "head_height / 2", 0]}))
products[-1]["parameters"]["size"]["options"] = INCH_SIZES
products[-1]["parameters"]["size"]["default"] = "1/4"
products[-1]["constants"] = {"ISO_PITCH": INCH_UNC_PITCH, "ISO_MAJOR": INCH_MAJOR, "HEAD_DIA": INCH_HEX_AF, "HEAD_HEIGHT": INCH_HEX_HEAD_H}

products.append(simple_product("inch-socket-head-screw", "Inch Socket Head Cap Screw", "Inch SHCS (UNC)", "fasteners", ["inch", "sae", "screw", "socket-head"],
    {"size": {"label": "Size", "type": "select", "options": INCH_SIZES, "default": "1/4", "group": "dimensions"},
     "length": {"label": "Length", "default": 20, "min": 5, "max": 100, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "INCH_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "head_radius": {"formula": "major_diameter * 0.75", "description": "Head radius"},
     "head_height": {"formula": "major_diameter", "description": "Head height"},
     "pitch": {"formula": "INCH_PITCH[size]", "description": "Pitch"}},
    {"INCH_MAJOR": INCH_MAJOR, "INCH_PITCH": INCH_UNC_PITCH},
    {"shank": {"type": "cylinder", "radius": "radius", "height": "length", "position": [0, "-length / 2", 0]},
     "head": {"type": "cylinder", "radius": "head_radius", "height": "head_height", "position": [0, "head_height / 2", 0]}},
    {"q1": {"label": "1/4x20", "values": {"size": "1/4", "length": 20}}}))

# === NUTS ===
products.append(nut_like("metric-nylon-lock-nut", "Metric Nylon Lock Nut", "DIN 985 nylon insert lock nut", ["iso", "metric", "nut", "lock-nut", "nylon"],
    {k: v * 1.15 for k, v in ISO_NUT_H.items()}))

products.append(nut_like("metric-flange-nut", "Metric Flange Nut", "DIN 6923 serrated flange nut", ["iso", "metric", "nut", "flange-nut"],
    ISO_NUT_H, extra_geo={
        "flange": {"type": "cylinder", "radius": "nut_af / 2 * 1.3", "height": "nut_height * 0.2", "segments": 32, "position": [0, "-nut_height * 0.4", 0]}}))

products.append(nut_like("metric-coupling-nut", "Metric Coupling Nut", "DIN 6334 long coupling nut", ["iso", "metric", "nut", "coupling-nut"],
    {k: v * 3.0 for k, v in ISO_NUT_H.items()}))

products.append(nut_like("metric-jam-nut", "Metric Jam Nut", "DIN 439 thin jam nut", ["iso", "metric", "nut", "jam-nut"],
    {k: round(v * 0.6, 1) for k, v in ISO_NUT_H.items()}))

products.append(nut_like("metric-cap-nut", "Metric Cap Nut (Acorn)", "DIN 1587 domed cap nut", ["iso", "metric", "nut", "cap-nut", "acorn"],
    ISO_NUT_H, extra_geo={
        "dome": {"type": "sphere", "radius": "nut_af / 2 * 0.9", "position": [0, "nut_height / 2", 0]}}))

# Inch nuts
products.append(simple_product("inch-hex-nut", "Inch Hex Nut", "SAE hex nut (UNC)", "fasteners", ["inch", "sae", "nut", "hex"],
    {"size": {"label": "Size", "type": "select", "options": INCH_SIZES, "default": "1/4", "group": "dimensions"}},
    {"major_diameter": {"formula": "INCH_MAJOR[size]", "description": "Diameter"}, "bore_radius": {"formula": "major_diameter / 2", "description": "Bore radius"},
     "nut_af": {"formula": "INCH_HEX_AF[size]", "description": "Width across flats"}, "outer_radius": {"formula": "nut_af / sqrt(3)", "description": "Circumscribed radius"},
     "nut_height": {"formula": "INCH_NUT_H[size]", "description": "Nut height"},
     "pitch": {"formula": "INCH_PITCH[size]", "description": "Pitch"}},
    {"INCH_MAJOR": INCH_MAJOR, "INCH_PITCH": INCH_UNC_PITCH, "INCH_HEX_AF": INCH_HEX_AF, "INCH_NUT_H": INCH_NUT_H},
    {"body": {"type": "polygon", "sides": 6, "radius": "outer_radius", "height": "nut_height", "bore": "bore_radius"}},
    {"q1": {"label": "1/4", "values": {"size": "1/4"}}}))

products.append(simple_product("inch-nylon-lock-nut", "Inch Nylon Lock Nut", "SAE nylon insert lock nut", "fasteners", ["inch", "sae", "nut", "lock-nut"],
    {"size": {"label": "Size", "type": "select", "options": INCH_SIZES, "default": "1/4", "group": "dimensions"}},
    {"major_diameter": {"formula": "INCH_MAJOR[size]", "description": "Diameter"}, "bore_radius": {"formula": "major_diameter / 2", "description": "Bore radius"},
     "nut_af": {"formula": "INCH_HEX_AF[size]", "description": "AF"}, "outer_radius": {"formula": "nut_af / sqrt(3)", "description": "Radius"},
     "nut_height": {"formula": "INCH_NUT_H[size] * 1.15", "description": "Height"},
     "pitch": {"formula": "INCH_PITCH[size]", "description": "Pitch"}},
    {"INCH_MAJOR": INCH_MAJOR, "INCH_PITCH": INCH_UNC_PITCH, "INCH_HEX_AF": INCH_HEX_AF, "INCH_NUT_H": INCH_NUT_H},
    {"body": {"type": "polygon", "sides": 6, "radius": "outer_radius", "height": "nut_height", "bore": "bore_radius"}},
    {"q1": {"label": "1/4", "values": {"size": "1/4"}}}))

products.append(simple_product("inch-jam-nut", "Inch Jam Nut", "SAE thin jam nut", "fasteners", ["inch", "sae", "nut", "jam-nut"],
    {"size": {"label": "Size", "type": "select", "options": INCH_SIZES, "default": "1/4", "group": "dimensions"}},
    {"major_diameter": {"formula": "INCH_MAJOR[size]", "description": "Diameter"}, "bore_radius": {"formula": "major_diameter / 2", "description": "Bore radius"},
     "nut_af": {"formula": "INCH_HEX_AF[size]", "description": "AF"}, "outer_radius": {"formula": "nut_af / sqrt(3)", "description": "Radius"},
     "nut_height": {"formula": "INCH_NUT_H[size] * 0.6", "description": "Height"},
     "pitch": {"formula": "INCH_PITCH[size]", "description": "Pitch"}},
    {"INCH_MAJOR": INCH_MAJOR, "INCH_PITCH": INCH_UNC_PITCH, "INCH_HEX_AF": INCH_HEX_AF, "INCH_NUT_H": INCH_NUT_H},
    {"body": {"type": "polygon", "sides": 6, "radius": "outer_radius", "height": "nut_height", "bore": "bore_radius"}},
    {"q1": {"label": "1/4", "values": {"size": "1/4"}}}))

# === WASHERS ===
products.append(washer("metric-flat-washer", "Metric Flat Washer", "ISO 7089 flat washer", ["iso", "metric", "washer"], ISO_SIZES, ISO_WASHER_ID, ISO_WASHER_OD, ISO_WASHER_T))
products.append(washer("metric-large-flat-washer", "Metric Large Flat Washer", "ISO 7093 large OD flat washer", ["iso", "metric", "washer", "fender"], ISO_SIZES, ISO_WASHER_ID, ISO_WASHER_OD_LARGE, {k: v * 1.2 for k, v in ISO_WASHER_T.items()}))
products.append(washer("metric-spring-lock-washer", "Metric Spring Lock Washer", "DIN 127 spring lock washer", ["iso", "metric", "washer", "lock"],
    ISO_SIZES, ISO_WASHER_ID, {k: round(v * 0.7, 1) for k, v in ISO_WASHER_OD.items()}, {k: round(v * 2, 1) for k, v in ISO_WASHER_T.items()}))
products.append(washer("inch-flat-washer-sae", "Inch SAE Flat Washer", "SAE standard flat washer", ["inch", "sae", "washer"], INCH_SIZES, INCH_WASHER_SAE_ID, INCH_WASHER_SAE_OD, INCH_WASHER_SAE_T))
products.append(washer("inch-flat-washer-uss", "Inch USS Flat Washer", "USS large flat washer", ["inch", "uss", "washer"],
    INCH_SIZES, INCH_WASHER_SAE_ID, {k: round(v * 1.3, 1) for k, v in INCH_WASHER_SAE_OD.items()}, {k: round(v * 1.2, 1) for k, v in INCH_WASHER_SAE_T.items()}))
products.append(washer("inch-lock-washer", "Inch Split Lock Washer", "Split lock washer (inch)", ["inch", "washer", "lock"],
    INCH_SIZES, INCH_WASHER_SAE_ID, {k: round(v * 0.7, 1) for k, v in INCH_WASHER_SAE_OD.items()}, {k: round(v * 2, 1) for k, v in INCH_WASHER_SAE_T.items()}))
products.append(washer("nylon-flat-washer", "Nylon Flat Washer", "Nylon insulating flat washer", ["nylon", "washer", "insulating"], ISO_SIZES, ISO_WASHER_ID, ISO_WASHER_OD, {k: round(v * 1.5, 1) for k, v in ISO_WASHER_T.items()}))
products.append(washer("rubber-flat-washer", "Rubber Flat Washer", "Rubber sealing washer", ["rubber", "washer", "seal"], ISO_SIZES[:9],
    {k: ISO_WASHER_ID[k] for k in ISO_SIZES[:9]}, {k: round(ISO_WASHER_OD[k] * 1.2, 1) for k in ISO_SIZES[:9]}, {k: round(ISO_WASHER_T[k] * 2.5, 1) for k in ISO_SIZES[:9]}))

# === PINS & DOWELS ===
products.append(pin("metric-dowel-pin", "Metric Dowel Pin", "ISO 2338 hardened dowel pin", ["iso", "metric", "dowel", "pin"]))
products.append(pin("metric-taper-pin", "Metric Taper Pin", "ISO 2339 taper pin", ["iso", "metric", "taper", "pin"], geo_override={
    "body": {"type": "cone", "radiusTop": "radius * 0.9", "radiusBottom": "radius", "height": "length"}}))
products.append(pin("metric-roll-pin", "Metric Roll Pin", "ISO 8752 spring roll pin", ["iso", "metric", "roll-pin", "spring-pin"], geo_override={
    "body": {"type": "cylinder", "radius": "radius", "height": "length", "bore": "radius * 0.7", "segments": 32}}))
products.append(pin("metric-clevis-pin", "Metric Clevis Pin", "Clevis pin with head", ["metric", "clevis", "pin"],
    extra_derived={"head_radius": {"formula": "radius * 1.5", "description": "Head radius"}, "head_height": {"formula": "pin_diameter * 0.3", "description": "Head height"}},
    geo_override={
        "shaft": {"type": "cylinder", "radius": "radius", "height": "length", "position": [0, "-length / 2", 0]},
        "head": {"type": "cylinder", "radius": "head_radius", "height": "head_height", "position": [0, "head_height / 2", 0]}}))
products.append(pin("inch-dowel-pin", "Inch Dowel Pin", "Hardened ground dowel pin (inch)", ["inch", "dowel", "pin"]))
products.append(pin("inch-roll-pin", "Inch Roll Pin", "Spring roll pin (inch)", ["inch", "roll-pin", "spring-pin"], geo_override={
    "body": {"type": "cylinder", "radius": "radius", "height": "length", "bore": "radius * 0.7", "segments": 32}}))
products.append(pin("inch-taper-pin", "Inch Taper Pin", "Standard taper pin (inch)", ["inch", "taper", "pin"], geo_override={
    "body": {"type": "cone", "radiusTop": "radius * 0.9", "radiusBottom": "radius", "height": "length"}}))

# === SPACERS & STANDOFFS ===
for mat in ["nylon", "aluminum", "steel"]:
    products.append(simple_product(f"round-spacer-{mat}", f"Round Spacer ({mat.title()})", f"{mat.title()} unthreaded round spacer", "spacers", [mat, "spacer", "round"],
        {"od": {"label": "OD", "default": 8, "min": 3, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"},
         "id_dim": {"label": "ID", "default": 4, "min": 1, "max": 20, "step": 0.5, "unit": "mm", "group": "dimensions"},
         "spacer_length": {"label": "Length", "default": 10, "min": 1, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"}},
        {"outer_radius": {"formula": "od / 2", "description": "Outer radius"}, "inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}},
        None,
        {"body": {"type": "cylinder", "radius": "outer_radius", "height": "spacer_length", "bore": "inner_radius", "segments": 32}},
        {"default": {"label": "8x4x10", "values": {"od": 8, "id_dim": 4, "spacer_length": 10}}}))

for style in [("mf", "Male-Female"), ("ff", "Female-Female"), ("mm", "Male-Male")]:
    products.append(simple_product(f"hex-standoff-{style[0]}", f"Hex Standoff ({style[1]})", f"{style[1]} hex standoff", "spacers", ["standoff", "hex", style[0]],
        {"af": {"label": "Across Flats", "default": 8, "min": 4, "max": 20, "step": 1, "unit": "mm", "group": "dimensions"},
         "thread": {"label": "Thread Size", "type": "select", "options": ["M2.5", "M3", "M4", "M5", "M6"], "default": "M3", "group": "dimensions"},
         "standoff_length": {"label": "Body Length", "default": 10, "min": 3, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"}},
        {"radius": {"formula": "af / sqrt(3)", "description": "Circumscribed radius"},
         "bore_radius": {"formula": "ISO_MAJOR[thread] / 2", "description": "Bore radius"},
         "pitch": {"formula": "ISO_PITCH[thread]", "description": "Thread pitch"}},
        {"ISO_MAJOR": {k: ISO_MAJOR[k] for k in ["M2.5", "M3", "M4", "M5", "M6"]}, "ISO_PITCH": {k: ISO_PITCH[k] for k in ["M2.5", "M3", "M4", "M5", "M6"]}},
        {"body": {"type": "polygon", "sides": 6, "radius": "radius", "height": "standoff_length", "bore": "bore_radius"}},
        {"default": {"label": "M3x10", "values": {"thread": "M3", "standoff_length": 10}}}))

products.append(simple_product("shoulder-spacer", "Shoulder Spacer", "Flanged shoulder spacer", "spacers", ["spacer", "shoulder", "flanged"],
    {"od": {"label": "OD", "default": 10, "min": 4, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"},
     "id_dim": {"label": "ID", "default": 5, "min": 2, "max": 20, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "spacer_length": {"label": "Length", "default": 10, "min": 2, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
     "flange_od": {"label": "Flange OD", "default": 15, "min": 6, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "flange_t": {"label": "Flange Thickness", "default": 1.5, "min": 0.5, "max": 5, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "od / 2", "description": "Outer radius"}, "inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"},
     "flange_radius": {"formula": "flange_od / 2", "description": "Flange radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "spacer_length", "bore": "inner_radius", "segments": 32},
     "flange": {"type": "cylinder", "radius": "flange_radius", "height": "flange_t", "bore": "inner_radius", "segments": 32, "position": [0, "spacer_length / 2 + flange_t / 2", 0]}},
    {"default": {"label": "Default", "values": {}}}))

# === BUSHINGS ===
for mat, has_flange in [("bronze-sleeve", False), ("flanged-bronze", True), ("nylon-sleeve", False), ("flanged-nylon", True),
                         ("ptfe-sleeve", False), ("steel-sleeve", False), ("oilite", False)]:
    mat_name = mat.replace("-", " ").title()
    products.append(bushing(f"{mat}-bushing", f"{mat_name} Bushing", f"{mat_name} plain bearing bushing",
                           [mat.split("-")[0], "bushing", "bearing"], has_flange=has_flange))

# === STRUCTURAL — BAR STOCK ===
products.append(bar_stock("round-bar-steel", "Steel Round Bar", "Cold-rolled steel round bar", ["steel", "round", "bar"], "round"))
products.append(bar_stock("round-bar-aluminum", "Aluminum Round Bar", "6061-T6 aluminum round bar", ["aluminum", "round", "bar"], "round"))
products.append(bar_stock("hex-bar-steel", "Steel Hex Bar", "Cold-drawn steel hex bar", ["steel", "hex", "bar"], "hex"))
products.append(bar_stock("square-bar-steel", "Steel Square Bar", "Cold-rolled steel square bar", ["steel", "square", "bar"], "square"))
products.append(bar_stock("flat-bar-steel", "Steel Flat Bar", "Hot-rolled steel flat bar", ["steel", "flat", "bar"], "flat"))
products.append(bar_stock("flat-bar-aluminum", "Aluminum Flat Bar", "6061-T6 aluminum flat bar", ["aluminum", "flat", "bar"], "flat"))

# === STRUCTURAL — TUBES ===
products.append(tube_stock("round-tube-steel", "Steel Round Tube", "Welded steel round tube", ["steel", "round", "tube"], "round"))
products.append(tube_stock("round-tube-aluminum", "Aluminum Round Tube", "6063-T5 aluminum round tube", ["aluminum", "round", "tube"], "round"))
products.append(tube_stock("square-tube-steel", "Steel Square Tube", "Welded steel square tube", ["steel", "square", "tube"], "square"))
products.append(tube_stock("rectangular-tube-steel", "Steel Rectangular Tube", "Welded steel rectangular tube", ["steel", "rectangular", "tube"], "rectangular"))

# === STRUCTURAL — BRACKETS ===
products.append(bracket("l-bracket-steel", "Steel L-Bracket", "90° angle bracket", ["steel", "bracket", "angle"],
    {"vertical": {"type": "box", "width": "bracket_width", "depth": "thickness", "height": "bracket_height", "position": [0, "bracket_height / 2", 0]},
     "horizontal": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness", "position": [0, "thickness / 2", "bracket_depth / 2"]}}))

products.append(bracket("t-bracket-steel", "Steel T-Bracket", "T-shaped bracket", ["steel", "bracket", "t-bracket"],
    {"vertical": {"type": "box", "width": "bracket_width", "depth": "thickness", "height": "bracket_height", "position": [0, "bracket_height / 2", 0]},
     "horizontal": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness", "position": [0, "bracket_height - thickness / 2", "bracket_depth / 2"]}}))

products.append(bracket("corner-bracket", "Corner Bracket", "Flat corner reinforcement bracket", ["bracket", "corner", "flat"],
    {"plate": {"type": "box", "width": "bracket_depth", "depth": "bracket_height", "height": "thickness"}}))

products.append(bracket("z-bracket", "Z-Bracket", "Z-shaped offset bracket", ["bracket", "z-bracket", "offset"],
    {"top": {"type": "box", "width": "bracket_width", "depth": "bracket_depth / 2", "height": "thickness", "position": [0, "bracket_height / 2 - thickness / 2", "bracket_depth / 4"]},
     "middle": {"type": "box", "width": "bracket_width", "depth": "thickness", "height": "bracket_height - thickness * 2", "position": [0, 0, 0]},
     "bottom": {"type": "box", "width": "bracket_width", "depth": "bracket_depth / 2", "height": "thickness", "position": [0, "-bracket_height / 2 + thickness / 2", "-bracket_depth / 4"]}}))

products.append(bracket("u-bracket", "U-Bracket", "U-shaped channel bracket", ["bracket", "u-bracket", "channel"],
    {"left": {"type": "box", "width": "thickness", "depth": "bracket_depth", "height": "bracket_height", "position": ["-bracket_width / 2 + thickness / 2", "bracket_height / 2", 0]},
     "right": {"type": "box", "width": "thickness", "depth": "bracket_depth", "height": "bracket_height", "position": ["bracket_width / 2 - thickness / 2", "bracket_height / 2", 0]},
     "bottom": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness", "position": [0, "thickness / 2", 0]}}))

products.append(bracket("mounting-plate", "Mounting Plate", "Flat mounting plate", ["plate", "mounting"],
    {"plate": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness"}}))

products.append(bracket("gusset-plate", "Gusset Plate", "Triangular gusset reinforcement plate", ["plate", "gusset", "structural"],
    {"plate": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness"}}))

products.append(bracket("base-plate", "Base Plate", "Heavy base plate", ["plate", "base"],
    {"plate": {"type": "box", "width": "bracket_width", "depth": "bracket_depth", "height": "thickness * 3"}}))

# Angle iron
products.append(simple_product("angle-iron", "Angle Iron", "Steel equal angle iron", "structural", ["steel", "angle", "structural"],
    {"leg": {"label": "Leg Size", "default": 25, "min": 10, "max": 80, "step": 5, "unit": "mm", "group": "dimensions"},
     "thickness": {"label": "Thickness", "default": 3, "min": 1, "max": 10, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "length": {"label": "Length", "default": 100, "min": 20, "max": 500, "step": 10, "unit": "mm", "group": "dimensions"}},
    {}, None,
    {"leg_a": {"type": "box", "width": "thickness", "depth": "leg", "height": "length"},
     "leg_b": {"type": "box", "width": "leg", "depth": "thickness", "height": "length", "position": ["leg / 2 - thickness / 2", 0, "-leg / 2 + thickness / 2"]}},
    {"default": {"label": "25x3x100", "values": {}}}))

# === PIPE FITTINGS ===
products.append(pipe_fitting("pipe-nipple", "Pipe Nipple", "Threaded pipe nipple", ["pipe", "nipple", "threaded"],
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "length", "bore": "inner_radius", "segments": 32}}))

products.append(pipe_fitting("pipe-coupling", "Pipe Coupling", "Threaded pipe coupling", ["pipe", "coupling"],
    {"body": {"type": "cylinder", "radius": "outer_radius * 1.15", "height": "length", "bore": "inner_radius", "segments": 32}}))

products.append(pipe_fitting("pipe-cap", "Pipe Cap", "Threaded pipe end cap", ["pipe", "cap"],
    {"body": {"type": "cylinder", "radius": "outer_radius * 1.1", "height": "length * 0.6", "segments": 32}}))

products.append(pipe_fitting("pipe-plug", "Pipe Plug", "Threaded pipe plug", ["pipe", "plug"],
    {"body": {"type": "cylinder", "radius": "outer_radius * 0.95", "height": "length * 0.5", "segments": 32},
     "head": {"type": "polygon", "sides": 6, "radius": "outer_radius * 0.8", "height": "outer_radius * 0.3", "position": [0, "length * 0.25 + outer_radius * 0.15", 0]}}))

products.append(simple_product("tube-sleeve", "Tube Sleeve", "Compression tube sleeve", "pipe-fittings", ["tube", "sleeve", "compression"],
    {"od": {"label": "Tube OD", "default": 10, "min": 4, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"},
     "sleeve_length": {"label": "Length", "default": 15, "min": 5, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "od / 2 + 2", "description": "Sleeve OD"}, "inner_radius": {"formula": "od / 2", "description": "Tube bore"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "sleeve_length", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "10mm", "values": {"od": 10}}}))

products.append(simple_product("tube-coupling", "Tube Coupling", "Tube-to-tube coupling", "pipe-fittings", ["tube", "coupling"],
    {"od": {"label": "Tube OD", "default": 10, "min": 4, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"},
     "coupling_length": {"label": "Length", "default": 25, "min": 10, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "od / 2 + 3", "description": "Coupling OD"}, "inner_radius": {"formula": "od / 2", "description": "Bore"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "coupling_length", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "10mm", "values": {"od": 10}}}))

products.append(simple_product("tube-reducer", "Tube Reducer", "Tube size reducer", "pipe-fittings", ["tube", "reducer"],
    {"od_large": {"label": "Large OD", "default": 20, "min": 8, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"},
     "od_small": {"label": "Small OD", "default": 10, "min": 4, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "reducer_length": {"label": "Length", "default": 25, "min": 10, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"large_radius": {"formula": "od_large / 2", "description": "Large end radius"}, "small_radius": {"formula": "od_small / 2", "description": "Small end radius"}},
    None,
    {"body": {"type": "cone", "radiusTop": "small_radius", "radiusBottom": "large_radius", "height": "reducer_length"}},
    {"default": {"label": "20→10", "values": {"od_large": 20, "od_small": 10}}}))

products.append(simple_product("tube-spacer", "Tube Spacer", "Precision tube spacer", "pipe-fittings", ["tube", "spacer"],
    {"od": {"label": "OD", "default": 12, "min": 4, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"},
     "id_dim": {"label": "ID", "default": 6, "min": 2, "max": 25, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "spacer_length": {"label": "Length", "default": 5, "min": 1, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "od / 2", "description": "Outer radius"}, "inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "spacer_length", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "12x6x5", "values": {}}}))

# === KNOBS & HANDLES ===
products.append(simple_product("round-knob", "Round Knob", "Smooth round control knob", "hardware", ["knob", "round"],
    {"knob_dia": {"label": "Diameter", "default": 25, "min": 10, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"},
     "knob_height": {"label": "Height", "default": 15, "min": 5, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "bore_dia": {"label": "Bore", "default": 6, "min": 3, "max": 15, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"knob_radius": {"formula": "knob_dia / 2", "description": "Knob radius"}, "bore_radius": {"formula": "bore_dia / 2", "description": "Bore radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "knob_radius", "height": "knob_height", "bore": "bore_radius", "segments": 32}},
    {"default": {"label": "25mm", "values": {}}}))

products.append(simple_product("ball-knob", "Ball Knob", "Spherical ball knob with bore", "hardware", ["knob", "ball"],
    {"knob_dia": {"label": "Diameter", "default": 25, "min": 10, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"},
     "bore_dia": {"label": "Bore", "default": 6, "min": 3, "max": 15, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "stem_length": {"label": "Stem Length", "default": 15, "min": 5, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"ball_radius": {"formula": "knob_dia / 2", "description": "Ball radius"}, "stem_radius": {"formula": "bore_dia / 2 + 1", "description": "Stem radius"}},
    None,
    {"ball": {"type": "sphere", "radius": "ball_radius", "position": [0, "ball_radius", 0]},
     "stem": {"type": "cylinder", "radius": "stem_radius", "height": "stem_length", "position": [0, "-stem_length / 2", 0]}},
    {"default": {"label": "25mm", "values": {}}}))

products.append(simple_product("t-handle", "T-Handle", "T-shaped handle with grip", "hardware", ["handle", "t-handle"],
    {"grip_length": {"label": "Grip Length", "default": 60, "min": 20, "max": 120, "step": 5, "unit": "mm", "group": "dimensions"},
     "grip_dia": {"label": "Grip Diameter", "default": 12, "min": 6, "max": 25, "step": 1, "unit": "mm", "group": "dimensions"},
     "shaft_length": {"label": "Shaft Length", "default": 40, "min": 10, "max": 80, "step": 5, "unit": "mm", "group": "dimensions"},
     "shaft_dia": {"label": "Shaft Diameter", "default": 6, "min": 3, "max": 15, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"grip_radius": {"formula": "grip_dia / 2", "description": "Grip radius"}, "shaft_radius": {"formula": "shaft_dia / 2", "description": "Shaft radius"}},
    None,
    {"grip": {"type": "cylinder", "radius": "grip_radius", "height": "grip_length", "rotation": [0, 0, "PI / 2"]},
     "shaft": {"type": "cylinder", "radius": "shaft_radius", "height": "shaft_length", "position": [0, "-shaft_length / 2", 0]}},
    {"default": {"label": "Default", "values": {}}}))

products.append(simple_product("pull-handle", "Pull Handle", "Bar pull handle", "hardware", ["handle", "pull"],
    {"handle_length": {"label": "Length", "default": 100, "min": 40, "max": 250, "step": 10, "unit": "mm", "group": "dimensions"},
     "handle_dia": {"label": "Bar Diameter", "default": 10, "min": 6, "max": 20, "step": 1, "unit": "mm", "group": "dimensions"},
     "standoff_h": {"label": "Standoff", "default": 25, "min": 10, "max": 60, "step": 5, "unit": "mm", "group": "dimensions"}},
    {"bar_radius": {"formula": "handle_dia / 2", "description": "Bar radius"}, "post_radius": {"formula": "handle_dia / 2 * 0.8", "description": "Post radius"}},
    None,
    {"bar": {"type": "cylinder", "radius": "bar_radius", "height": "handle_length", "rotation": [0, 0, "PI / 2"], "position": [0, "standoff_h", 0]},
     "post_l": {"type": "cylinder", "radius": "post_radius", "height": "standoff_h", "position": ["-handle_length / 2 + handle_dia", "standoff_h / 2", 0]},
     "post_r": {"type": "cylinder", "radius": "post_radius", "height": "standoff_h", "position": ["handle_length / 2 - handle_dia", "standoff_h / 2", 0]}},
    {"default": {"label": "Default", "values": {}}}))

products.append(simple_product("lever-handle", "Lever Handle", "Straight lever handle", "hardware", ["handle", "lever"],
    {"handle_length": {"label": "Length", "default": 80, "min": 30, "max": 200, "step": 5, "unit": "mm", "group": "dimensions"},
     "handle_dia": {"label": "Diameter", "default": 10, "min": 6, "max": 20, "step": 1, "unit": "mm", "group": "dimensions"},
     "bore_dia": {"label": "Bore", "default": 6, "min": 3, "max": 15, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"handle_radius": {"formula": "handle_dia / 2", "description": "Handle radius"}, "bore_radius": {"formula": "bore_dia / 2", "description": "Bore radius"},
     "hub_radius": {"formula": "handle_dia * 0.8", "description": "Hub radius"}, "hub_height": {"formula": "handle_dia", "description": "Hub height"}},
    None,
    {"handle": {"type": "cylinder", "radius": "handle_radius", "height": "handle_length", "rotation": [0, 0, "PI / 2"], "position": ["handle_length / 2", 0, 0]},
     "hub": {"type": "cylinder", "radius": "hub_radius", "height": "hub_height", "bore": "bore_radius", "segments": 32}},
    {"default": {"label": "Default", "values": {}}}))

# === SHAFT HARDWARE ===
products.append(simple_product("shaft-collar-setscrew", "Set Screw Shaft Collar", "One-piece set screw shaft collar", "shaft-hardware", ["shaft", "collar", "set-screw"],
    {"bore_dia": {"label": "Bore", "default": 10, "min": 3, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "collar_od": {"label": "OD", "default": 20, "min": 8, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"},
     "collar_width": {"label": "Width", "default": 9, "min": 3, "max": 25, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"bore_radius": {"formula": "bore_dia / 2", "description": "Bore radius"}, "outer_radius": {"formula": "collar_od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "collar_width", "bore": "bore_radius", "segments": 32}},
    {"d10": {"label": "10mm bore", "values": {"bore_dia": 10, "collar_od": 20}}}))

products.append(simple_product("shaft-collar-clamp", "Clamp Shaft Collar", "Two-piece clamping shaft collar", "shaft-hardware", ["shaft", "collar", "clamp"],
    {"bore_dia": {"label": "Bore", "default": 10, "min": 3, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "collar_od": {"label": "OD", "default": 22, "min": 8, "max": 65, "step": 1, "unit": "mm", "group": "dimensions"},
     "collar_width": {"label": "Width", "default": 11, "min": 3, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"bore_radius": {"formula": "bore_dia / 2", "description": "Bore radius"}, "outer_radius": {"formula": "collar_od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "collar_width", "bore": "bore_radius", "segments": 32}},
    {"d10": {"label": "10mm bore", "values": {"bore_dia": 10, "collar_od": 22}}}))

products.append(simple_product("shaft-sleeve", "Shaft Sleeve", "Precision shaft sleeve adapter", "shaft-hardware", ["shaft", "sleeve"],
    {"id_dim": {"label": "Inner Diameter", "default": 8, "min": 3, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "od": {"label": "Outer Diameter", "default": 12, "min": 5, "max": 40, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "sleeve_length": {"label": "Length", "default": 20, "min": 5, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}, "outer_radius": {"formula": "od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "sleeve_length", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "8x12x20", "values": {}}}))

products.append(simple_product("shaft-spacer", "Shaft Spacer", "Precision shaft spacer", "shaft-hardware", ["shaft", "spacer"],
    {"id_dim": {"label": "ID", "default": 8, "min": 3, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "od": {"label": "OD", "default": 14, "min": 5, "max": 40, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "spacer_length": {"label": "Length", "default": 5, "min": 1, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}, "outer_radius": {"formula": "od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "spacer_length", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "8x14x5", "values": {}}}))

products.append(simple_product("thrust-washer", "Thrust Washer", "Bronze thrust washer", "shaft-hardware", ["thrust", "washer", "bronze", "bearing"],
    {"id_dim": {"label": "ID", "default": 10, "min": 3, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "od": {"label": "OD", "default": 20, "min": 8, "max": 60, "step": 1, "unit": "mm", "group": "dimensions"},
     "washer_thickness": {"label": "Thickness", "default": 1.5, "min": 0.5, "max": 5, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}, "outer_radius": {"formula": "od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "washer_thickness", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "10x20x1.5", "values": {}}}))

products.append(simple_product("flat-gasket", "Flat Gasket", "Flat ring gasket", "shaft-hardware", ["gasket", "seal", "rubber"],
    {"id_dim": {"label": "ID", "default": 15, "min": 5, "max": 80, "step": 1, "unit": "mm", "group": "dimensions"},
     "od": {"label": "OD", "default": 25, "min": 10, "max": 100, "step": 1, "unit": "mm", "group": "dimensions"},
     "gasket_thickness": {"label": "Thickness", "default": 2, "min": 0.5, "max": 6, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}, "outer_radius": {"formula": "od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "gasket_thickness", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "15x25x2", "values": {}}}))

# === MISC HARDWARE ===
products.append(simple_product("rubber-grommet", "Rubber Grommet", "Rubber cable grommet", "hardware", ["rubber", "grommet", "cable"],
    {"hole_dia": {"label": "Panel Hole", "default": 12, "min": 5, "max": 40, "step": 1, "unit": "mm", "group": "dimensions"},
     "id_dim": {"label": "Cable ID", "default": 6, "min": 2, "max": 30, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "grommet_thickness": {"label": "Thickness", "default": 3, "min": 1, "max": 8, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "hole_dia / 2 + 2", "description": "Outer radius"}, "bore_radius": {"formula": "id_dim / 2", "description": "Cable bore"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "grommet_thickness", "bore": "bore_radius", "segments": 32}},
    {"default": {"label": "12mm hole", "values": {}}}))

products.append(simple_product("nylon-standoff-round", "Nylon Round Standoff", "Nylon PCB round standoff", "hardware", ["nylon", "standoff", "pcb"],
    {"od": {"label": "OD", "default": 6, "min": 3, "max": 15, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "id_dim": {"label": "Hole ID", "default": 3.2, "min": 1.5, "max": 8, "step": 0.1, "unit": "mm", "group": "dimensions"},
     "standoff_length": {"label": "Length", "default": 8, "min": 2, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"outer_radius": {"formula": "od / 2", "description": "Outer radius"}, "bore_radius": {"formula": "id_dim / 2", "description": "Bore radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "standoff_length", "bore": "bore_radius", "segments": 32}},
    {"default": {"label": "M3x8", "values": {}}}))

products.append(simple_product("pcb-hex-standoff", "PCB Hex Standoff", "Brass hex PCB standoff", "hardware", ["brass", "standoff", "pcb", "hex"],
    {"af": {"label": "Across Flats", "default": 5, "min": 3, "max": 12, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "thread": {"label": "Thread", "type": "select", "options": ["M2", "M2.5", "M3", "M4"], "default": "M3", "group": "dimensions"},
     "standoff_length": {"label": "Length", "default": 8, "min": 3, "max": 30, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"radius": {"formula": "af / sqrt(3)", "description": "Circumscribed radius"},
     "bore_radius": {"formula": "ISO_MAJOR[thread] / 2", "description": "Bore radius"},
     "pitch": {"formula": "ISO_PITCH[thread]", "description": "Thread pitch"}},
    {"ISO_MAJOR": {k: ISO_MAJOR[k] for k in ["M2", "M2.5", "M3", "M4"]}, "ISO_PITCH": {k: ISO_PITCH[k] for k in ["M2", "M2.5", "M3", "M4"]}},
    {"body": {"type": "polygon", "sides": 6, "radius": "radius", "height": "standoff_length", "bore": "bore_radius"}},
    {"m3x8": {"label": "M3x8", "values": {"thread": "M3", "standoff_length": 8}}}))

products.append(simple_product("cable-clamp-plate", "Cable Clamp Plate", "Two-piece cable clamp plate", "hardware", ["clamp", "cable", "plate"],
    {"plate_width": {"label": "Width", "default": 20, "min": 10, "max": 50, "step": 5, "unit": "mm", "group": "dimensions"},
     "plate_length": {"label": "Length", "default": 30, "min": 15, "max": 80, "step": 5, "unit": "mm", "group": "dimensions"},
     "plate_thickness": {"label": "Thickness", "default": 3, "min": 1, "max": 8, "step": 0.5, "unit": "mm", "group": "dimensions"}},
    {}, None,
    {"plate": {"type": "box", "width": "plate_width", "depth": "plate_length", "height": "plate_thickness"}},
    {"default": {"label": "Default", "values": {}}}))

products.append(simple_product("shim-washer", "Shim Washer", "Precision shim washer", "hardware", ["shim", "washer", "precision"],
    {"id_dim": {"label": "ID", "default": 10, "min": 3, "max": 40, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "od": {"label": "OD", "default": 16, "min": 6, "max": 60, "step": 0.5, "unit": "mm", "group": "dimensions"},
     "shim_thickness": {"label": "Thickness", "default": 0.5, "min": 0.1, "max": 3, "step": 0.1, "unit": "mm", "group": "dimensions"}},
    {"inner_radius": {"formula": "id_dim / 2", "description": "Inner radius"}, "outer_radius": {"formula": "od / 2", "description": "Outer radius"}},
    None,
    {"body": {"type": "cylinder", "radius": "outer_radius", "height": "shim_thickness", "bore": "inner_radius", "segments": 32}},
    {"default": {"label": "10x16x0.5", "values": {}}}))

products.append(simple_product("adjustment-screw", "Adjustment Screw", "Knurled adjustment screw", "hardware", ["screw", "adjustment", "knurled"],
    {"size": {"label": "Thread", "type": "select", "options": ["M3", "M4", "M5", "M6", "M8"], "default": "M6", "group": "dimensions"},
     "length": {"label": "Length", "default": 15, "min": 5, "max": 50, "step": 1, "unit": "mm", "group": "dimensions"}},
    {"major_diameter": {"formula": "ISO_MAJOR[size]", "description": "Diameter"}, "radius": {"formula": "major_diameter / 2", "description": "Radius"},
     "knob_radius": {"formula": "major_diameter * 1.2", "description": "Knob radius"}, "knob_height": {"formula": "major_diameter * 0.6", "description": "Knob height"},
     "pitch": {"formula": "ISO_PITCH[size]", "description": "Pitch"}},
    {"ISO_MAJOR": {k: ISO_MAJOR[k] for k in ["M3", "M4", "M5", "M6", "M8"]}, "ISO_PITCH": {k: ISO_PITCH[k] for k in ["M3", "M4", "M5", "M6", "M8"]}},
    {"thread": {"type": "cylinder", "radius": "radius", "height": "length", "position": [0, "-length / 2", 0]},
     "knob": {"type": "cylinder", "radius": "knob_radius", "height": "knob_height", "segments": 24, "position": [0, "knob_height / 2", 0]}},
    {"m6x15": {"label": "M6x15", "values": {"size": "M6", "length": 15}}}))


# ─── Generate Files ────────────────────────────────────────────────────

def main():
    # Keep existing manually-created schemas
    existing = ["laptop-stand", "iso-screw", "hex-nut", "enclosure", "shelf-bracket"]

    # Write all generated schemas
    count = 0
    for p in products:
        filepath = os.path.join(SCHEMA_DIR, f"{p['id']}.json")
        with open(filepath, 'w') as f:
            json.dump(p, f, indent=2)
        count += 1

    print(f"Generated {count} schema files")

    # Load existing schemas for registry
    existing_schemas = []
    for eid in existing:
        filepath = os.path.join(SCHEMA_DIR, f"{eid}.json")
        if os.path.exists(filepath):
            with open(filepath) as f:
                s = json.load(f)
            entry = {"id": s["id"], "name": s["name"], "description": s.get("description", ""), "schema": f"./schemas/{eid}.json"}
            if eid == "laptop-stand":
                entry["preview"] = "./geometry/laptop-stand-shader.js"
                entry["export"] = "./geometry/laptop-stand.js"
            elif eid == "iso-screw":
                entry["preview"] = "./geometry/iso-screw-preview.js"
                entry["export"] = "./geometry/iso-screw.js"
            entry["tags"] = s.get("tags", []) if "tags" in s else []
            entry["category"] = s.get("category", "general")
            existing_schemas.append(entry)

    # Build registry
    registry = {"version": "2.0.0", "schemas": existing_schemas}
    for p in products:
        if p["id"] not in existing:
            registry["schemas"].append({
                "id": p["id"],
                "name": p["name"],
                "description": p.get("description", ""),
                "schema": f"./schemas/{p['id']}.json",
                "tags": p.get("tags", []),
                "category": p.get("category", "general"),
            })

    registry_path = os.path.join(SCHEMA_DIR, "registry.json")
    with open(registry_path, 'w') as f:
        json.dump(registry, f, indent=2)

    print(f"Registry: {len(registry['schemas'])} total entries")
    print("Done!")


if __name__ == "__main__":
    main()

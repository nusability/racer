// Track rendering tunables. Kept beside the renderer rather than in data/tuning.ts because
// nothing here changes how a race plays: only how the course looks and what it costs to draw.

export type Quality = 'low' | 'high';

// --- Chunking and culling ---
/**
 * Corridor geometry is merged per chunk of this many metres: short enough for frustum culling
 * to bite, long enough that the three meshes per chunk stay inside the draw-call budget.
 */
export const CHUNK_LENGTH = { low: 1400, high: 600 } as const;
/** Chunks whose bounds are farther than the fog's far edge plus this are hidden. */
export const CULL_MARGIN = 150;

// --- Fog (also the visible range: nothing past fogFar is drawn) ---
export const FOG_NEAR = { low: 220, high: 320 } as const;
export const FOG_FAR = { low: 1500, high: 2600 } as const;

// --- Corridor ---
/** Every n-th sample becomes a cross-section station for walls and shoulders. */
export const STATION_STRIDE = { low: 3, high: 2 } as const;
/** Run-off narrower than this is treated as a wall at the road edge. */
export const RUNOFF_MIN = 2;
/** The boundary at the far side of the run-off: a rising lip, its height and how far it runs. */
export const RIDGE_HEIGHT = 3.2;
export const RIDGE_RISE = 7;
/** Reach of the run-off side past the hard boundary (lip, back slope and sand shoulder). */
export const RIDGE_OUTER = 46;
/** Walled sides that are not canyons: a low rock wall this tall, reaching this far out. */
export const WALL_LOW = 5;
export const WALL_OUTER = 40;
/** Lateral reach of a canyon cross-section (wall, rim plateau and back slope). */
export const CANYON_OUTER = 95;
/** Width of the flat rim on top of a canyon wall. */
export const CANYON_RIM = 32;
/** A canyon wall rises/falls this many metres per metre at its ends, so it never pops up. */
export const WALL_TAPER = 0.9;
/** Walls taller than this are drawn as full canyon cross-sections. */
export const CANYON_MIN_HEIGHT = 7;
/** Mesa rock around a tunnel: lateral reach past the road edge and rise over the ceiling. */
export const TUNNEL_ROCK_WIDTH = 75;
export const TUNNEL_ROCK_ABOVE = 34;
/** Spacing of the lit ceiling ribs inside tunnels, metres. */
export const TUNNEL_RIB_SPACING = 18;
/** How far a chasm's crack runs past the hard boundary, and how deep its glowing floor sits. */
export const CHASM_SIDE = 45;
export const CHASM_FLOOR_EXTRA = 12;
/** Painted kerb block length along the road edge, metres. */
export const KERB_BLOCK = 8;

// --- Texture tiling (metres per repeat) ---
export const ROAD_TEXTURE_LENGTH = 64;
export const SAND_TILE = 22;
export const ROCK_TILE = 36;
/** Requested anisotropic filtering; three clamps to what the GPU offers. */
export const ANISOTROPY = 8;
/** Procedural texture resolution (square, power of two). */
export const TEXTURE_SIZE = { low: 512, high: 1024 } as const;

// --- Water (biomes with a sea) ---
/** The sea surface height, metres; roads beside water stay well above it. */
export const SEA_LEVEL = 0;
/** Depth of the sea bed under a lagoon's water run-off, metres. */
export const LAGOON_DEPTH = 1.4;

// --- Terrain ---
/** Terrain extends this far past the course's bounding box. */
export const TERRAIN_MARGIN = 1900;
/** Terrain tile size; tiles near the course get fine cells, the rest one coarse mesh. */
export const TERRAIN_TILE = 1000;
/** Cells per tile edge. Far counts divide near counts so tile borders share vertices. */
export const TERRAIN_CELLS_NEAR = { low: 30, high: 60 } as const;
export const TERRAIN_CELLS_FAR = { low: 10, high: 12 } as const;
/** A tile is "near" when the course passes within this of it. */
export const TERRAIN_NEAR_DIST = 700;
/** Tiles get a downward skirt so neighbours of different resolution never show a crack. */
export const TERRAIN_SKIRT = 25;
/** Terrain under the corridor sinks this far so it never pokes through road or shoulders. */
export const TERRAIN_SINK = 7;
/** Shortest distance over which the ground eases from road level to the open dunes. */
export const GROUND_BLEND_MIN = 140;
/** The ease lengthens by this many metres per metre of height difference (≈ slope 1:n). */
export const GROUND_BLEND_PER_M = 2.6;
/** Coarse grid used to find the nearest centreline sample for any ground point. */
export const FIELD_CELL = 24;
export const FIELD_REACH = 560;

// --- Props ---
export const MARKER_SPACING = 500;
/** Corners tighter than this get chevron boards on the outside. */
export const CHEVRON_RADIUS = 260;
export const CHEVRON_SPACING = 36;
export const FLAG_SPACING = 30;
/** Pylons along the crest of a run-off lip, metres apart. */
export const PYLON_SPACING = 32;
/** Light posts along walled sections and the start straight, metres apart. */
export const LIGHT_SPACING = 48;
/** Start-straight dressing spans this far either side of the line. */
export const START_ZONE = 260;
/** Boost pad chevrons scroll this many texture repeats per second. */
export const BOOST_SCROLL = 2.2;

// --- Distant silhouettes ---
/** Mesas and spires stand this far beyond the course's bounding box. */
export const HORIZON_MIN = 450;
export const HORIZON_MAX = 1700;

// --- Landmarks ---
/** Landmarks within this of the camera animate; past it they are hidden too. */
export const LANDMARK_VIEW = { low: 1500, high: 2600 } as const;
/** Ground under a landmark is levelled out to this multiple of its radius. */
export const LANDMARK_PAD = 1.1;

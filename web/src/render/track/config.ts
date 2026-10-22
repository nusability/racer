// Track rendering tunables. Kept beside the renderer rather than in data/tuning.ts because
// nothing here changes how a race plays: only how the course looks and what it costs to draw.

export type Quality = 'low' | 'high';

// --- Chunking and culling ---
/** Corridor geometry is merged per chunk of this many metres so frustum culling bites. */
export const CHUNK_LENGTH = 400;
/** Chunks whose bounds are farther than the fog's far edge plus this are hidden. */
export const CULL_MARGIN = 150;

// --- Fog (also the visible range: nothing past fogFar is drawn) ---
export const FOG_NEAR = { low: 220, high: 320 } as const;
export const FOG_FAR = { low: 1700, high: 2600 } as const;

// --- Corridor ---
/** Every n-th sample becomes a cross-section station for walls and shoulders. */
export const STATION_STRIDE = { low: 3, high: 2 } as const;
/** Height of the low barrier that marks the road edge when there's no canyon wall. */
export const BERM_HEIGHT = 1.3;
/** Length of one painted block on the edge barrier, metres. */
export const BERM_BLOCK = 8;
/** How far the sand shoulder runs out from the barrier before the open terrain takes over. */
export const SHOULDER_WIDTH = 42;
/** Lateral reach of a canyon cross-section (wall, rim plateau and back slope). */
export const CANYON_OUTER = 95;
/** Width of the flat rim on top of a canyon wall. */
export const CANYON_RIM = 32;
/** A canyon wall rises/falls this many metres per metre at its ends, so it never pops up. */
export const WALL_TAPER = 0.9;
/** Walls taller than this are drawn as full canyon cross-sections. */
export const CANYON_MIN_HEIGHT = 4;
/** Mesa rock around a tunnel: lateral reach past the road edge and rise over the ceiling. */
export const TUNNEL_ROCK_WIDTH = 75;
export const TUNNEL_ROCK_ABOVE = 34;
/** Spacing of the lit ceiling ribs inside tunnels, metres. */
export const TUNNEL_RIB_SPACING = 18;
/** How far a chasm's pit extends past the road edge, and how deep its glowing floor sits. */
export const CHASM_SIDE = SHOULDER_WIDTH;
export const CHASM_FLOOR_EXTRA = 12;
/** Road texture repeats every this many metres along the lap. */
export const ROAD_TEXTURE_LENGTH = 64;

// --- Terrain ---
/** Terrain extends this far past the course's bounding box. */
export const TERRAIN_MARGIN = 1900;
/** Terrain tile size; tiles near the course get fine cells, the rest one coarse mesh. */
export const TERRAIN_TILE = 1000;
export const TERRAIN_CELL_NEAR = { low: 26, high: 17 } as const;
export const TERRAIN_CELL_FAR = { low: 110, high: 80 } as const;
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
export const FIELD_REACH = 520;

// --- Props ---
export const MARKER_SPACING = 500;
/** Corners tighter than this get chevron boards on the outside. */
export const CHEVRON_RADIUS = 260;
export const CHEVRON_SPACING = 36;
export const FLAG_SPACING = 30;
/** Start-straight dressing spans this far either side of the line. */
export const START_ZONE = 260;
/** Boost pad chevrons scroll this many texture repeats per second. */
export const BOOST_SCROLL = 2.2;

// --- Distant silhouettes ---
/** Mesas and spires stand this far beyond the course's bounding box. */
export const HORIZON_MIN = 450;
export const HORIZON_MAX = 1700;

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

// Constantes copiadas de pixel-agents
const CHAR_COUNT = 6;
const CHAR_FRAME_H = 32;
const CHAR_FRAME_W = 16;
const CHAR_FRAMES_PER_ROW = 7;
const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
const FLOOR_TILE_SIZE = 16;
const PNG_ALPHA_THRESHOLD = 10;
const WALL_BITMASK_COUNT = 16;
const WALL_GRID_COLS = 4;
const WALL_PIECE_HEIGHT = 32;
const WALL_PIECE_WIDTH = 16;
const LAYOUT_REVISION_KEY = 'layoutRevision';

function rgbaToHex(r: number, g: number, b: number, a: number): string {
    if (a < PNG_ALPHA_THRESHOLD) return '';
    const rgb = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    if (a >= 255) return rgb;
    return `${rgb}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
    try {
        const png = PNG.sync.read(pngBuffer);
        const sprite: string[][] = [];
        const data = png.data;

        for (let y = 0; y < height; y++) {
            const row: string[] = [];
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * png.width + x) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const a = data[pixelIndex + 3];
                row.push(rgbaToHex(r, g, b, a));
            }
            sprite.push(row);
        }
        return sprite;
    } catch (err) {
        const sprite: string[][] = [];
        for (let y = 0; y < height; y++) {
            sprite.push(new Array(width).fill(''));
        }
        return sprite;
    }
}

// ── Asset Loading ───────────────────────────────────────────

export async function loadPixelAssets(assetsRoot: string) {
    const assetsDir = path.join(assetsRoot, 'assets');
    
    // 1. Load Windows / Floors / Walls
    const wallTiles = await loadWallTiles(assetsDir);
    const floorTiles = await loadFloorTiles(assetsDir);
    const charSprites = await loadCharacterSprites(assetsDir);
    const furniture = await loadFurnitureAssets(assetsDir);
    const layout = loadDefaultLayout(assetsDir);

    return {
        wallTiles: wallTiles?.sets,
        floorTiles: floorTiles?.sprites,
        characters: charSprites?.characters,
        furnitureAssets: furniture,
        layout: layout
    };
}

// Minimal implementation of loadWallTiles
async function loadWallTiles(assetsDir: string) {
    const wallsDir = path.join(assetsDir, 'walls');
    if (!fs.existsSync(wallsDir)) return null;
    
    const entries = fs.readdirSync(wallsDir);
    const wallFiles = entries.filter(e => /^wall_(\d+)\.png$/i.test(e)).sort();
    
    const sets: string[][][][] = [];
    for (const filename of wallFiles) {
        const pngBuffer = fs.readFileSync(path.join(wallsDir, filename));
        const png = PNG.sync.read(pngBuffer);
        const sprites: string[][][] = [];
        
        for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
            const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
            const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
            const sprite: string[][] = [];
            for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
                const row: string[] = [];
                for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
                    const idx = ((oy + r) * png.width + (ox + c)) * 4;
                    row.push(rgbaToHex(png.data[idx], png.data[idx+1], png.data[idx+2], png.data[idx+3]));
                }
                sprite.push(row);
            }
            sprites.push(sprite);
        }
        sets.push(sprites);
    }
    return { sets };
}

// Minimal floor tiles
async function loadFloorTiles(assetsDir: string) {
    const floorsDir = path.join(assetsDir, 'floors');
    if (!fs.existsSync(floorsDir)) return null;
    const entries = fs.readdirSync(floorsDir);
    const floorFiles = entries.filter(e => /^floor_(\d+)\.png$/i.test(e)).sort();
    
    const sprites: string[][][] = [];
    for (const filename of floorFiles) {
        const buf = fs.readFileSync(path.join(floorsDir, filename));
        sprites.push(pngToSpriteData(buf, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE));
    }
    return { sprites };
}

// Minimal Characters
async function loadCharacterSprites(assetsDir: string) {
    const charDir = path.join(assetsDir, 'characters');
    const characters: any[] = [];

    for (let ci = 0; ci < CHAR_COUNT; ci++) {
        const filePath = path.join(charDir, `char_${ci}.png`);
        if (!fs.existsSync(filePath)) return null;

        const png = PNG.sync.read(fs.readFileSync(filePath));
        const charData: any = { down: [], up: [], right: [] };

        for (let dirIdx = 0; dirIdx < CHARACTER_DIRECTIONS.length; dirIdx++) {
            const dir = CHARACTER_DIRECTIONS[dirIdx];
            const rowOffsetY = dirIdx * CHAR_FRAME_H;
            const frames: string[][][] = [];

            for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
                const sprite: string[][] = [];
                const frameOffsetX = f * CHAR_FRAME_W;
                for (let y = 0; y < CHAR_FRAME_H; y++) {
                    const row: string[] = [];
                    for (let x = 0; x < CHAR_FRAME_W; x++) {
                        const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4;
                        row.push(rgbaToHex(png.data[idx], png.data[idx+1], png.data[idx+2], png.data[idx+3]));
                    }
                    sprite.push(row);
                }
                frames.push(sprite);
            }
            charData[dir] = frames;
        }
        characters.push(charData);
    }
    return { characters };
}

// Default layout
function loadDefaultLayout(assetsDir: string) {
    let bestRevision = 0;
    let bestPath: string | null = null;
    if (fs.existsSync(assetsDir)) {
        for (const file of fs.readdirSync(assetsDir)) {
            const match = /^default-layout-(\d+)\.json$/.exec(file);
            if (match) {
                const rev = parseInt(match[1], 10);
                if (rev > bestRevision) { bestRevision = rev; bestPath = path.join(assetsDir, file); }
            }
        }
    }
    if (!bestPath && fs.existsSync(path.join(assetsDir, 'default-layout.json'))) {
        bestPath = path.join(assetsDir, 'default-layout.json');
    }
    if (!bestPath) return null;
    return JSON.parse(fs.readFileSync(bestPath, 'utf-8'));
}

// Furniture simplified - just read manifest.json files that are type 'asset', since that covers most logic. 
// For full pixel-agents compatibility, we recursively flatten all items like the VSCode extension.
async function loadFurnitureAssets(assetsDir: string) {
    const furnitureDir = path.join(assetsDir, 'furniture');
    if (!fs.existsSync(furnitureDir)) return null;
    
    const dirs = fs.readdirSync(furnitureDir, { withFileTypes: true }).filter(e => e.isDirectory());
    const catalog: any[] = [];
    const sprites: Record<string, string[][]> = {};
    
    // Simplification for the backend loader: we just execute the exact same flatten mechanism.
    for (const dir of dirs) {
        const itemDir = path.join(furnitureDir, dir.name);
        const manifestPath = path.join(itemDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const processNode = (node: any, inherited: any): any[] => {
            if (node.type === 'asset') {
                const asset = [ {
                    id: node.id,
                    name: inherited.name, label: inherited.name, category: inherited.category,
                    file: node.file ?? `${node.id}.png`, width: node.width, height: node.height,
                    footprintW: node.footprintW, footprintH: node.footprintH,
                    isDesk: inherited.category === 'desks',
                    canPlaceOnWalls: inherited.canPlaceOnWalls, canPlaceOnSurfaces: inherited.canPlaceOnSurfaces,
                    backgroundTiles: inherited.backgroundTiles, groupId: inherited.groupId,
                    ...((node.orientation || inherited.orientation) ? { orientation: node.orientation || inherited.orientation } : {}),
                    ...((node.state || inherited.state) ? { state: node.state || inherited.state } : {}),
                    ...(node.mirrorSide ? { mirrorSide: true } : {}),
                    ...(inherited.rotationScheme ? { rotationScheme: inherited.rotationScheme } : {}),
                    ...(inherited.animationGroup ? { animationGroup: inherited.animationGroup } : {}),
                    ...(node.frame !== undefined ? { frame: node.frame } : {})
                }];
                return asset;
            }
            const group = node;
            const results: any[] = [];
            for (const member of group.members) {
                const childProps = { ...inherited };
                if (group.groupType === 'rotation' && group.rotationScheme) childProps.rotationScheme = group.rotationScheme;
                if (group.groupType === 'state') {
                    if (group.orientation) childProps.orientation = group.orientation;
                    if (group.state) childProps.state = group.state;
                }
                if (group.groupType === 'animation') {
                    const orient = group.orientation ?? inherited.orientation ?? '';
                    const state = group.state ?? inherited.state ?? '';
                    childProps.animationGroup = `${inherited.groupId}_${orient}_${state}`.toUpperCase();
                    if (group.state) childProps.state = group.state;
                }
                if (group.orientation && !childProps.orientation) childProps.orientation = group.orientation;
                results.push(...processNode(member, childProps));
            }
            return results;
        };
        
        const inherited: Record<string, any> = {
            groupId: manifest.id, name: manifest.name, category: manifest.category,
            canPlaceOnWalls: manifest.canPlaceOnWalls, canPlaceOnSurfaces: manifest.canPlaceOnSurfaces, backgroundTiles: manifest.backgroundTiles
        };
        
        let assets: any[];
        if (manifest.type === 'asset') {
            manifest.id = manifest.id || manifest.name;
            assets = processNode(manifest, inherited);
        } else {
            if (manifest.rotationScheme) inherited.rotationScheme = manifest.rotationScheme;
            assets = processNode({
                type: 'group', groupType: manifest.groupType, rotationScheme: manifest.rotationScheme, members: manifest.members
            }, inherited);
        }
        
        for (const asset of assets) {
            try {
                const buf = fs.readFileSync(path.join(itemDir, asset.file));
                sprites[asset.id] = pngToSpriteData(buf, asset.width, asset.height);
            } catch (e) { }
        }
        catalog.push(...assets);
    }
    return { catalog, sprites };
}

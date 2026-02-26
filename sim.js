import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ── RENDERER — configuración PBR nivel industrial ──
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;  // ligeramente subexpuesto — más cinematográfico
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ── ENVIRONMENT MAP — RoomEnvironment industrial (reflectividad PBR real en metales) ──
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// ── ESCENA ──
const scene = new THREE.Scene();
scene.environment = roomEnv;           // aplica env map a TODOS los materiales metálicos
scene.background = new THREE.Color(0xc8d0d8);  // gris industrial interior
scene.fog = new THREE.FogExp2(0xc8d0d8, 0.010);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
// Vista isométrica lateral derecha — grúa a la derecha, Expander centrado
// Distancia ajustada para ver grúa (X=10) + Expander (X=0) + montacargas (X=-8)
camera.position.set(16, 10, 16);

const controls = new OrbitControls(camera, canvas);
controls.target.set(1, 3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 50;  // limitar zoom out para no perder la escena
controls.minDistance = 2;
controls.maxPolarAngle = Math.PI * 0.88;

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ── ILUMINACIÓN INDUSTRIAL REAL (4500K neutro — LED high-bay) ──
// Ambiente muy bajo — las luces puntuales hacen el trabajo (no luz plana)
scene.add(new THREE.AmbientLight(0xfff0e0, 0.28)); // ambiente cálido muy bajo

// Luz direccional difusa (simula el conjunto de luminarias como GI)
const hemiLight = new THREE.HemisphereLight(0xfff8f0, 0x404060, 0.55); // cielo cálido / suelo frío
scene.add(hemiLight);

// LED high-bay fixtures — 4500K, sombras suaves, atenuación real
const ledPositions = [
    [-24, 8.55, -22], [-24, 8.55, -11], [-24, 8.55, 0], [-24, 8.55, 11], [-24, 8.55, 22],
    [-12, 8.55, -22], [-12, 8.55, -11], [-12, 8.55, 0], [-12, 8.55, 11], [-12, 8.55, 22],
    [0, 8.55, -22], [0, 8.55, -11], [0, 8.55, 0], [0, 8.55, 11], [0, 8.55, 22],
    [12, 8.55, -22], [12, 8.55, -11], [12, 8.55, 0], [12, 8.55, 11], [12, 8.55, 22],
    [24, 8.55, -22], [24, 8.55, -11], [24, 8.55, 0], [24, 8.55, 11], [24, 8.55, 22],
];
ledPositions.forEach(([x, y, z], i) => {
    const led = new THREE.PointLight(0xfff5e0, 4.5, 22, 1.6); // 4500K industrial
    led.position.set(x, y, z);
    if (i % 4 === 0) { led.castShadow = true; led.shadow.mapSize.setScalar(512); }
    scene.add(led);
});

// Fill light lateral — compensa sombras duras en paredes (simula GI)
const fillL = new THREE.DirectionalLight(0xe8f0ff, 0.18);
fillL.position.set(-20, 6, 10); scene.add(fillL);

// ── TEXTURAS PROCEDURALES PBR ──

// Genera canvas texture con ruido procedural
function cvTex(w, h, fn, repeat = 1) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    fn(ctx, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
}

// Mapa de rugosidad metálica con micro-rayones (acero pintado)
function makeMetalRoughMap(baseGray = 140, variation = 40) {
    return cvTex(512, 512, (ctx, w, h) => {
        const g = baseGray;
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(0, 0, w, h);
        // Rayones directionales (dirección de lijado industrial)
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 280; i++) {
            const x = Math.random() * w;
            const len = Math.random() * 60 + 15;
            const v = g + (Math.random() - 0.5) * variation;
            ctx.strokeStyle = `rgb(${v},${v},${v})`;
            ctx.lineWidth = Math.random() * 1.2 + 0.3;
            ctx.beginPath(); ctx.moveTo(x, Math.random() * h);
            ctx.lineTo(x + (Math.random() - 0.5) * 8, Math.random() * h);
            ctx.stroke();
        }
        // Manchas de AO leves en zonas de acumulación
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const r = ctx.createRadialGradient(x, y, 0, x, y, Math.random() * 40 + 10);
            r.addColorStop(0, `rgba(60,60,60,0.6)`);
            r.addColorStop(1, `rgba(60,60,60,0)`);
            ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
        }
        ctx.globalAlpha = 1;
    }, 4);
}

// Textura de suciedad / envejecimiento (para zona baja de equipos)
function makeDirtMap() {
    return cvTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = 'rgb(200,200,200)';
        ctx.fillRect(0, 0, w, h);
        // Zona baja más oscura (suciedad acumulada)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(200,200,200,0)');
        grad.addColorStop(0.6, 'rgba(140,130,120,0.4)');
        grad.addColorStop(1, 'rgba(100,90,80,0.7)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Manchas irregulares
        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const r = ctx.createRadialGradient(x, y, 0, x, y, Math.random() * 25 + 5);
            r.addColorStop(0, 'rgba(80,70,60,0.8)'); r.addColorStop(1, 'rgba(80,70,60,0)');
            ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
        }
        ctx.globalAlpha = 1;
    }, 2);
}

// Piso concreto industrial PBR (color map con grietas, manchas, señales desgastadas)
function makeFloorPBR() {
    return cvTex(2048, 2048, (ctx, w, h) => {
        // Base concreto pulido (tono frío industrial)
        const baseGrad = ctx.createLinearGradient(0, 0, w, h);
        baseGrad.addColorStop(0, '#b8bcbf');
        baseGrad.addColorStop(0.5, '#c2c6c9');
        baseGrad.addColorStop(1, '#bdc1c4');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, w, h);
        // Variación de superficie (concreto no es uniforme)
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const s = Math.random() * 5 + 1;
            const v = Math.floor(Math.random() * 25 - 12);
            const c = 180 + v;
            ctx.fillStyle = `rgba(${c},${c - 2},${c - 4},${0.2 + Math.random() * 0.3})`;
            ctx.fillRect(x, y, s, s * (0.5 + Math.random()));
        }
        // Grietas finas (capilares de concreto envejecido)
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#8a8e90';
        for (let i = 0; i < 18; i++) {
            const x0 = Math.random() * w, y0 = Math.random() * h;
            ctx.lineWidth = Math.random() * 0.8 + 0.3;
            ctx.beginPath(); ctx.moveTo(x0, y0);
            let cx = x0, cy = y0;
            for (let s = 0; s < 8; s++) {
                cx += (Math.random() - 0.5) * 60; cy += Math.random() * 40 + 10;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Manchas de aceite
        for (let i = 0; i < 12; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const r = ctx.createRadialGradient(x, y, 0, x, y, Math.random() * 30 + 8);
            r.addColorStop(0, 'rgba(40,35,30,0.35)'); r.addColorStop(1, 'rgba(40,35,30,0)');
            ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
        }
        // — ZONA AZUL de producción (área marcada en piso)
        ctx.fillStyle = 'rgba(30,65,160,0.22)';
        ctx.fillRect(0, 0, w * 0.38, h);
        // — FRANJAS AMARILLAS de seguridad (desgastadas por tráfico)
        ctx.fillStyle = '#f0bc12';
        // Franja vertical principal
        ctx.fillRect(w * 0.425, 0, w * 0.04, h);
        ctx.fillRect(0, h * 0.425, w, h * 0.04);
        // Desgaste sobre franjas
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 80; i++) {
            const xf = w * 0.425 + Math.random() * w * 0.04;
            const yf = Math.random() * h;
            ctx.fillStyle = `rgba(120,110,80,${Math.random() * 0.6})`;
            ctx.fillRect(xf, yf, Math.random() * 18 + 4, Math.random() * 3 + 1);
        }
        ctx.globalAlpha = 1;
        // Marcas de tráfico de montacargas
        ctx.strokeStyle = 'rgba(50,50,50,0.18)';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) {
            const yTrack = Math.random() * h;
            ctx.beginPath();
            ctx.moveTo(0, yTrack); ctx.lineTo(w, yTrack + (Math.random() - 0.5) * 50);
            ctx.stroke();
        }
    }, 1);
}

// Mapa de rugosidad del piso (variable: pulido 0.2 en centro, rugoso 0.7 en bordes)
function makeFloorRoughMap() {
    return cvTex(1024, 1024, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
        g.addColorStop(0, '#505050');  // zona pulida central (roughness 0.31)
        g.addColorStop(0.7, '#7a7a7a'); // transición
        g.addColorStop(1, '#aaaaaa'); // bordes más rugosos
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // Parches de alta rugosidad (desgaste)
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const r = ctx.createRadialGradient(x, y, 0, x, y, Math.random() * 60 + 20);
            r.addColorStop(0, 'rgba(180,180,180,0.6)'); r.addColorStop(1, 'rgba(180,180,180,0)');
            ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
        }
    }, 1);
}

// Textura caucho (llantas del montacargas)
function makeRubberMap() {
    return cvTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, w, h);
        // Dibujo del neumático (patrón grabado)
        ctx.strokeStyle = '#0e0e0e';
        for (let y = 0; y < h; y += 12) {
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            // Surón transversal
            if ((y / 12) % 3 === 0) {
                for (let x = 0; x < w; x += 24) {
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y + 12); ctx.stroke();
                }
            }
        }
        // Polvo en lateral
        ctx.globalAlpha = 0.2;
        const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
        grad.addColorStop(0, 'rgba(180,170,150,0)'); grad.addColorStop(1, 'rgba(180,170,150,0.6)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
    }, 3);
}

// Textura pared concreto / panel sandwich
function makeWallMap() {
    return cvTex(1024, 1024, (ctx, w, h) => {
        ctx.fillStyle = '#e2e5e7';
        ctx.fillRect(0, 0, w, h);
        // Variación de panel (juntas)
        ctx.strokeStyle = 'rgba(190,195,198,0.8)';
        ctx.lineWidth = 1.5;
        for (let y = 0; y < h; y += 128) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        // Suciedad leve en el borde inferior
        const grad = ctx.createLinearGradient(0, h * 0.8, 0, h);
        grad.addColorStop(0, 'rgba(150,145,140,0)'); grad.addColorStop(1, 'rgba(140,135,130,0.28)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        // Polvo en aristas
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            ctx.fillStyle = `rgba(${170 + Math.random() * 20},${168 + Math.random() * 20},${165 + Math.random() * 20},0.08)`;
            ctx.fillRect(x, y, Math.random() * 4, Math.random() * 4);
        }
    }, 2);
}

// Texturas pre-generadas
const floorColorTex = makeFloorPBR();
const floorRoughTex = makeFloorRoughMap();
const metalRoughTex = makeMetalRoughMap(130, 45);
const dirtTex = makeDirtMap();
const rubberTex = makeRubberMap();
const wallTex = makeWallMap();

// ── HELPERS ──
const mk = p => new THREE.MeshStandardMaterial(p);
function mesh(geo, mat, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);

// ── MATERIALES PBR INDUSTRIALES ──
// Todos con roughnessMap procedural para microdetalle superficial real
const M = {
    // Piso de concreto industrial pulido — variable roughness
    floor: new THREE.MeshStandardMaterial({
        map: floorColorTex, roughnessMap: floorRoughTex,
        roughness: 0.45, metalness: 0.02,
        envMapIntensity: 0.15,
    }),
    // Paredes panel sandwich blanco industrial
    wall: new THREE.MeshStandardMaterial({
        map: wallTex, roughness: 0.88, metalness: 0.03,
    }),
    // Concreto columnas y zócalos
    struct: new THREE.MeshStandardMaterial({
        color: 0x8898aa, roughnessMap: metalRoughTex,
        roughness: 0.48, metalness: 0.68, envMapIntensity: 0.8,
    }),
    // Franja amarilla de seguridad (pintura en piso)
    stripe: new THREE.MeshStandardMaterial({ color: 0xf0bc10, roughness: 0.55, metalness: 0.0 }),
    // Tubería general (acero galvanizado)
    pipe: new THREE.MeshStandardMaterial({
        color: 0xc8d0d4, roughnessMap: metalRoughTex,
        roughness: 0.28, metalness: 0.78, envMapIntensity: 1.0,
    }),
    // Tubería roja contraincendio
    pipeR: new THREE.MeshStandardMaterial({
        color: 0xcc2000, roughnessMap: metalRoughTex,
        roughness: 0.32, metalness: 0.45, envMapIntensity: 0.6,
    }),
    // Tubería amarilla (gas / proceso)
    pipeY: new THREE.MeshStandardMaterial({
        color: 0xd89000, roughness: 0.38, metalness: 0.42, envMapIntensity: 0.5,
    }),
    // Tubería verde (agua / retorno)
    pipeG: new THREE.MeshStandardMaterial({
        color: 0x1e7033, roughness: 0.42, metalness: 0.38, envMapIntensity: 0.5,
    }),
    // Charola eléctrica
    tray: new THREE.MeshStandardMaterial({
        color: 0x556677, roughnessMap: metalRoughTex,
        roughness: 0.42, metalness: 0.72, envMapIntensity: 0.7,
    }),
    // Expander — marco acero estructural gris
    expGr: new THREE.MeshStandardMaterial({
        color: 0x8a9aaa, roughnessMap: metalRoughTex,
        roughness: 0.40, metalness: 0.78, envMapIntensity: 1.1,
    }),
    // Expander — partes oscuras (cabeza, base)
    expDk: new THREE.MeshStandardMaterial({
        color: 0x2a3540, roughnessMap: metalRoughTex,
        roughness: 0.50, metalness: 0.65, envMapIntensity: 0.7,
    }),
    // Expander — lugs / platinas pulidas
    expLg: new THREE.MeshStandardMaterial({
        color: 0xa8bbd0, roughness: 0.22, metalness: 0.92, envMapIntensity: 1.3,
    }),
    // CG marker
    cgMat: mk({ color: 0x00cc88, emissive: 0x00cc88, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }),
    // Grúa Liebherr — amarillo industrial CAT/Liebherr
    titYl: new THREE.MeshStandardMaterial({
        color: 0xf0bb00, roughnessMap: metalRoughTex,
        roughness: 0.42, metalness: 0.52, envMapIntensity: 0.9,
    }),
    // Grúa — partes oscuras
    titDk: new THREE.MeshStandardMaterial({
        color: 0x242424, roughnessMap: metalRoughTex,
        roughness: 0.58, metalness: 0.55, envMapIntensity: 0.6,
    }),
    // Grúa — negro carros/contrapeso
    titBk: new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.85, metalness: 0.12,
    }),
    // Montacargas — cuerpo pintado industrial (oscuro)
    vsaYl: new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughnessMap: dirtTex,
        roughness: 0.52, metalness: 0.50, envMapIntensity: 0.7,
    }),
    // Montacargas — partes muy oscuras
    vsaDk: new THREE.MeshStandardMaterial({
        color: 0x0d0d0d, roughness: 0.72, metalness: 0.45,
    }),
    // Llantas caucho
    rubber: new THREE.MeshStandardMaterial({
        color: 0x161616, map: rubberTex,
        roughness: 0.88, metalness: 0.0,
    }),
    // Rodillos y base
    roller: new THREE.MeshStandardMaterial({
        color: 0x6688aa, roughness: 0.22, metalness: 0.88, envMapIntensity: 1.0,
    }),
    base: new THREE.MeshStandardMaterial({
        color: 0x445566, roughness: 0.50, metalness: 0.72, envMapIntensity: 0.8,
    }),
    // Madera (tallas)
    wood: mk({ color: 0x8b6520, roughness: 0.90, metalness: 0 }),
    // Conos de seguridad
    cone: mk({ color: 0xff5500, roughness: 0.45, metalness: 0.08 }),
    // Zona exclusión (semitransparente)
    zone: mk({ color: 0xffaa00, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    // Cristal (ventanas)
    glass: mk({ color: 0x99ccee, transparent: true, opacity: 0.3, roughness: 0, metalness: 0.1 }),
    // Ropa de trabajo / piel trabajadores
    skin: mk({ color: 0xc68642, roughness: 0.90, metalness: 0 }),
    unif: mk({ color: 0x1a3a1a, roughness: 0.82, metalness: 0 }),
    helmB: mk({ color: 0x228822, roughness: 0.38, metalness: 0.22 }),
    helmG: mk({ color: 0xff4400, roughness: 0.50, metalness: 0.10 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.35, metalness: 0.72, envMapIntensity: 0.9 }),
    envlp: mk({ color: 0xff8800, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    vest: mk({ color: 0xaaee00, roughness: 0.82, metalness: 0 }),
};


// ── NAVE INDUSTRIAL (PBR realista) ───────────────────────────────────────────
// Piso concreto 2K con grietas/manchas/franjas. Paredes panel. Vigas metálicas.
function buildNave() {
    const matBeam = new THREE.MeshStandardMaterial({
        color: 0x788898, roughnessMap: metalRoughTex,
        roughness: 0.50, metalness: 0.72, envMapIntensity: 0.85,
    });
    const matCol = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.82, metalness: 0.04 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0xd5d8da, roughness: 0.88, metalness: 0.08 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xf0bc10, roughness: 0.55, metalness: 0.0 });
    const matBlue = new THREE.MeshStandardMaterial({ color: 0x1e4db5, roughness: 0.50, metalness: 0.0, transparent: true, opacity: 0.85 });
    const matZone = new THREE.MeshStandardMaterial({ color: 0xffcc00, transparent: true, opacity: 0.10, side: THREE.DoubleSide });
    const matLamp = new THREE.MeshStandardMaterial({ color: 0xb0b5ba, roughness: 0.38, metalness: 0.65, envMapIntensity: 0.9 });
    const matGlow = new THREE.MeshStandardMaterial({ color: 0xfff8e8, emissive: 0xfff8e8, emissiveIntensity: 3.5, transparent: true, opacity: 0.95 });
    const matExt = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.38, metalness: 0.48, envMapIntensity: 0.6 });
    const matZocalo = new THREE.MeshStandardMaterial({ color: 0xb0b5b8, roughness: 0.84, metalness: 0.03 });

    // PISO PBR — 2K procedural: grietas capilares, manchas aceite, franjas desgastadas
    const floor = mesh(new THREE.PlaneGeometry(70, 58), M.floor, false, true);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);


    // Zona pintada azul (área de producción real)
    const blueZone = mesh(new THREE.PlaneGeometry(20, 54), matBlue, false, false);
    blueZone.rotation.x = -Math.PI / 2; blueZone.position.set(-8, 0.003, 0); scene.add(blueZone);

    // Franjas amarillas de seguridad (verticales y horizontales)
    for (let x = -28; x <= 28; x += 10) {
        const s = mesh(B(0.22, 0.01, 58), matYellow, false, false); s.position.set(x, 0.007, 0); scene.add(s);
    }
    for (let z = -24; z <= 24; z += 8) {
        const s = mesh(B(70, 0.01, 0.22), matYellow, false, false); s.position.set(0, 0.007, z); scene.add(s);
    }
    // Zona de exclusión naranja
    const ez = mesh(new THREE.PlaneGeometry(16, 14), matZone, false, false);
    ez.rotation.x = -Math.PI / 2; ez.position.set(3, 0.01, 0); scene.add(ez);

    // PAREDES — PBR: panel sandwich con juntas y suciedad leve (M.wall)
    const matWallClean = M.wall;
    const wN = mesh(B(72, 9.5, 0.28), matWallClean, false, true); wN.position.set(0, 4.75, -27); scene.add(wN);
    const wW = mesh(B(0.28, 9.5, 58), matWallClean, false, true); wW.position.set(-33, 4.75, 0); scene.add(wW);
    // Pared este (derecha — parcial)
    const wEbot = mesh(B(0.28, 4.5, 20), matWallClean, false, true); wEbot.position.set(33, 2.25, -13); scene.add(wEbot);
    const wEtop = mesh(B(0.28, 2.5, 58), matWallClean, false, true); wEtop.position.set(33, 8.25, 0); scene.add(wEtop);
    // Zócalos de concreto
    const zN = mesh(B(72, 1.2, 0.35), matZocalo); zN.position.set(0, 0.6, -26.8); scene.add(zN);
    const zW = mesh(B(0.35, 1.2, 58), matZocalo); zW.position.set(-32.8, 0.6, 0); scene.add(zW);

    // TECHO — panel sandwich blanco (como en fotos)
    const roof = mesh(B(72, 0.22, 58), matRoof, false, false); roof.position.set(0, 9.0, 0); scene.add(roof);

    // COLUMNAS DE CONCRETO cuadradas 50×50cm (igual a fotos reales)
    const colXs = [-28, -18, -8, 2, 12, 22, 30];
    const colZs = [-24, 0, 24];
    colXs.forEach(cx => colZs.forEach(cz => {
        const col = mesh(B(0.52, 9.1, 0.52), matCol);
        col.position.set(cx, 4.55, cz); scene.add(col);
        // Cartela superior
        const cap = mesh(B(0.75, 0.35, 0.75), matBeam, false, false);
        cap.position.set(cx, 8.85, cz); scene.add(cap);
    }));

    // VIGAS PRINCIPALES H (correas longitudinales y transversales)
    [-24, -12, 0, 12, 24].forEach(vz => {
        const v = mesh(B(64, 0.38, 0.22), matBeam, false, false); v.position.set(0, 8.75, vz); scene.add(v);
        const a = mesh(B(64, 0.10, 0.06), matBeam, false, false); a.position.set(0, 8.38, vz); scene.add(a);
    });
    colXs.forEach(vx => {
        const v = mesh(B(0.22, 0.38, 50), matBeam, false, false); v.position.set(vx, 8.75, 0); scene.add(v);
        // Diagonales de cercha Pratt
        for (let di = -22; di <= 22; di += 7) {
            const d = mesh(B(0.07, 0.06, 7.5), matBeam, false, false);
            d.rotation.z = 0.4; d.position.set(vx, 8.42, di); scene.add(d);
        }
    });

    // LÁMPARAS LED HIGH-BAY (campanas industriales redondas — iguales fotos)
    const lamps = [];
    for (let lx = -24; lx <= 24; lx += 12) {
        for (let lz = -22; lz <= 22; lz += 11) lamps.push([lx, lz]);
    }
    lamps.forEach(([lx, lz]) => {
        const body = mesh(new THREE.CylinderGeometry(0.25, 0.16, 0.20, 10), matLamp, false, false);
        body.position.set(lx, 8.78, lz); scene.add(body);
        const glow = mesh(new THREE.CircleGeometry(0.20, 10), matGlow, false, false);
        glow.rotation.x = Math.PI / 2; glow.position.set(lx, 8.65, lz); scene.add(glow);
        const cable = mesh(B(0.025, 0.35, 0.025), matBeam, false, false);
        cable.position.set(lx, 9.08, lz); scene.add(cable);
        const pt = new THREE.PointLight(0xfff8f0, 5, 18, 1.8);
        pt.position.set(lx, 8.5, lz); scene.add(pt);
    });

    // CHAROLAS ELÉCTRICAS aéreas (cable trays — visibles en fotos)
    [[0, 8.15, -14, 62, 0], [0, 8.0, -16, 62, 0], [0, 7.85, -18, 60, 0],
        [-18, 8.1, 0, 0, 52], [-20, 7.9, 0, 0, 52]].forEach(([tx, ty, tz, tw, td]) => {
            const tr = mesh(B(tw || 0.20, 0.07, td || 0.38), M.tray, false, false);
            tr.position.set(tx, ty, tz); scene.add(tr);
            const len = tw || td;
            for (let i = -len / 2 + 1.5; i < len / 2; i += 2.5) {
                const sup = mesh(B(0.03, 0.45, 0.03), M.tray, false, false);
                sup.position.set(tw ? tx + i : tx, ty + 0.28, td ? tz + i : tz); scene.add(sup);
            }
        });


    // EXTINTOR
    const ext = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 8), matExt);
    ext.position.set(-31, 1.1, -12); scene.add(ext);
}

// ── TUBERÍAS (interferencia aérea) ——————————————————————————————
// Todas las tuberías y charolas DENTRO de la nave (bajo y=9.0 techo)
// Tubería contraincendio principal a y=7.8 — LÍMITE REAL de clearance
function buildPipes() {
    // Tubería contraincendio (roja) — INTERFERENCIA PRINCIPAL — a 7.8m
    const matFireR = mk({ color: 0xdd1100, roughness: 0.35, metalness: 0.55 });
    const fireH = 7.8; // altura crítica de la tubería contraincendio
    const pd = [
        // Tubería contraincendio principal — horizontal, a 7.80 m (LÍMITE REAL)
        [0, fireH, 0, 0, 60, matFireR, 0.12],   // principal longitudinal
        [0, fireH - 0.14, 3, 0, 60, matFireR, 0.10], // paralela lateral
        // Bajantes tubería contraincendio (sprinklers)
        [-12, fireH, 0, 1, 16, matFireR, 0.08],
        [0, fireH, 0, 1, 16, matFireR, 0.08],
        [12, fireH, 0, 1, 16, matFireR, 0.08],
        // Red eléctrica y gas (charolas) — a 7.5m y 7.2m
        [0, 7.50, -2, 0, 58, M.pipeY, 0.09],
        [0, 7.20, -5, 0, 55, M.pipeG, 0.09],
        [0, 7.60, 5, 0, 55, M.pipe, 0.08],
        // Transversales
        [-8, 7.8, 0, 1, 14, M.pipe, 0.08],
        [-3, 7.5, 0, 1, 14, M.pipeY, 0.09],
        [6, 7.8, 0, 1, 14, M.pipeR, 0.08],
        [10, 7.5, 0, 1, 12, M.pipeG, 0.08],
    ];
    pd.forEach(([x, y, z, dir, len, mat, r]) => {
        const p = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, false, false);
        if (dir === 0) { p.rotation.z = Math.PI / 2; } p.position.set(x, y, z); scene.add(p);
        for (let f = -len / 2 + 2; f <= len / 2; f += 3.5) {
            const fl = mesh(new THREE.TorusGeometry(r + 0.04, 0.025, 5, 10), mat, false, false);
            if (dir === 0) { fl.rotation.y = Math.PI / 2; fl.position.set(x + f, y, z); }
            else { fl.rotation.x = Math.PI / 2; fl.position.set(x, y, z + f); }
            scene.add(fl);
        }
    });
    // Sprinklers
    for (let sx = -20; sx <= 20; sx += 5) for (let sz = -10; sz <= 10; sz += 5) {
        const sp = mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.25, 6), matFireR, false, false);
        sp.position.set(sx, fireH - 0.12, sz); scene.add(sp);
    }
    // Charolas eléctricas
    [[0, 8.1, -14, 60, 0], [0, 7.9, -18, 58, 0], [-18, 8.0, 0, 0, 52], [-20, 7.8, 0, 0, 50]].forEach(([tx, ty, tz, tw, td]) => {
        const tr = mesh(B(tw || 0.22, 0.07, td || 0.40), M.tray, false, false);
        tr.position.set(tx, ty, tz); scene.add(tr);
    });
    // Soportes colgantes tuberías
    for (let x = -16; x <= 16; x += 4) {
        const sup = mesh(B(0.04, 1.10, 0.04), M.struct, false, false);
        sup.position.set(x, fireH + 0.55, 0); scene.add(sup);
    }
}

// ── EXPANDER — Prensa Hidráulica Industrial (7.60 m vertical → horizontal) ──
// Basado en foto real: frame rectangular, plataformas, barandales amarillos, escalera
const EL = 7.6;
let expanderGrp, cgMarker;

function buildExpander() {
    expanderGrp = new THREE.Group();
    scene.add(expanderGrp);
    // Expander centrado con ≥1.5m libre en todos los lados antes del abatimiento
    expanderGrp.position.set(0, 0.5, 0);
    expanderGrp.rotation.z = 0;

    const matFrame = mk({ color: 0x8a9aaa, roughness: 0.5, metalness: 0.7 });  // gris acero
    const matDark = mk({ color: 0x2a3540, roughness: 0.6, metalness: 0.6 });  // gris oscuro
    const matYRail = mk({ color: 0xf5c000, roughness: 0.4, metalness: 0.2 });  // amarillo barandal
    const matPlaten = mk({ color: 0xb0bcc8, roughness: 0.3, metalness: 0.8 });  // platinas acero
    const matHyd = mk({ color: 0x4466aa, roughness: 0.2, metalness: 0.9 });  // cilindros hidráulicos
    const matRed = mk({ color: 0xcc1111, roughness: 0.5, metalness: 0.3 });  // logo rojo
    const matGrat = mk({ color: 0x667788, roughness: 0.6, metalness: 0.6 });  // grating piso
    const matLg = mk({ color: 0xaabbcc, roughness: 0.2, metalness: 0.9 });  // lugs izaje

    const W = 2.4, D = 1.8; // ancho y profundidad del frame

    // ── COLUMNAS PRINCIPALES (4 esquinas) ──
    const colPts = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    colPts.forEach(([cx, cz]) => {
        const col = mesh(B(0.24, EL, 0.24), matFrame);
        col.position.set(cx, EL / 2, cz); expanderGrp.add(col);
    });

    // ── TRAVESAÑOS HORIZONTALES (cada ~1.5m) ──
    const travYs = [0.3, 1.5, 2.8, 4.0, 5.2, 6.4, EL - 0.2];
    travYs.forEach(ty => {
        // travesaños frontales y traseros
        [-D / 2, D / 2].forEach(tz => {
            const tr = mesh(B(W + 0.24, 0.14, 0.14), matFrame);
            tr.position.set(0, ty, tz); expanderGrp.add(tr);
        });
        // travesaños laterales
        [-W / 2, W / 2].forEach(tx => {
            const tr = mesh(B(0.14, 0.14, D + 0.24), matFrame);
            tr.position.set(tx, ty, 0); expanderGrp.add(tr);
        });
    });

    // ── PLATINAS / PLATENS DE PRENSA (4 platinas intermedias) ──
    [1.3, 2.5, 3.7, 4.9].forEach(py => {
        const plt = mesh(B(W + 0.1, 0.18, D + 0.1), matPlaten);
        plt.position.set(0, py, 0); expanderGrp.add(plt);
        // Detalle borde platina
        const edge = mesh(B(W + 0.3, 0.06, D + 0.3), matDark);
        edge.position.set(0, py - 0.12, 0); expanderGrp.add(edge);
    });

    // ── CROSSHEAD SUPERIOR (más grueso) ──
    const ch = mesh(B(W + 0.3, 0.55, D + 0.3), matDark);
    ch.position.set(0, EL - 0.28, 0); expanderGrp.add(ch);
    const chTop = mesh(B(W + 0.5, 0.22, D + 0.5), matFrame);
    chTop.position.set(0, EL + 0.11, 0); expanderGrp.add(chTop);

    // ── CILINDROS HIDRÁULICOS (2 arriba) ──
    [-0.6, 0.6].forEach(cx => {
        const cyl = mesh(C(0.2, 0.2, 2.8, 12), matHyd);
        cyl.position.set(cx, EL - 1.7, 0); expanderGrp.add(cyl);
        const rod = mesh(C(0.12, 0.12, 1.8, 10), matPlaten);
        rod.position.set(cx, EL - 3.0, 0); expanderGrp.add(rod);
        // Tapa cilindro
        const cap = mesh(C(0.25, 0.25, 0.12, 10), matDark);
        cap.position.set(cx, EL - 0.34, 0); expanderGrp.add(cap);
    });

    // ── BASE / BANCADA ──
    const base = mesh(B(W + 0.6, 0.55, D + 0.6), matDark);
    base.position.set(0, 0.28, 0); expanderGrp.add(base);
    const baseFlange = mesh(B(W + 1.0, 0.16, D + 1.0), matFrame);
    baseFlange.position.set(0, 0.08, 0); expanderGrp.add(baseFlange);
    // Pernos de anclaje
    for (let px = -0.8; px <= 0.8; px += 1.6) for (let pz = -0.6; pz <= 0.6; pz += 1.2) {
        const bolt = mesh(C(0.06, 0.06, 0.45, 6), mk({ color: 0x555555, roughness: 0.4, metalness: 0.9 }));
        bolt.position.set(px, -0.22, pz); expanderGrp.add(bolt);
    }

    // ── CONVEYOR / MESA DE SALIDA (base) ──
    const conv = mesh(B(3.5, 0.18, D + 0.2), matDark);
    conv.position.set(2.2, 0.09, 0); expanderGrp.add(conv);
    for (let rx = 0.5; rx <= 3.4; rx += 0.55) {
        const roll = mesh(C(0.08, 0.08, D + 0.0, 8), matPlaten);
        roll.rotation.z = Math.PI / 2; roll.position.set(rx + 0.5, 0.22, 0); expanderGrp.add(roll);
    }

    // ── PLATAFORMAS CON BARANDALES AMARILLOS ──
    const platYs = [3.0, 5.5];
    platYs.forEach(py => {
        // Piso grating
        const plat = mesh(B(W + 0.5, 0.08, 1.2), matGrat);
        plat.position.set(-W / 2 - 0.6, py, 0); expanderGrp.add(plat);
        // Barandal frontal
        const rl = mesh(B(W + 0.5, 0.06, 0.06), matYRail);
        rl.position.set(-W / 2 - 0.6, py + 1.05, 0.55); expanderGrp.add(rl);
        // Posts barandal
        [-W / 2 - 0.6 - 0.5, -W / 2 - 0.6 + 0.5].forEach(px => {
            const post = mesh(B(0.06, 1.1, 0.06), matYRail);
            post.position.set(px, py + 0.55, 0.55); expanderGrp.add(post);
        });
    });

    // ── ESCALERA LATERAL ──
    const ladderX = -W / 2 - 0.15;
    // Largueros
    [-0.2, 0.2].forEach(lz => {
        const rail = mesh(B(0.05, EL - 0.5, 0.05), matYRail);
        rail.position.set(ladderX, EL / 2, lz); expanderGrp.add(rail);
    });
    // Peldaños
    for (let ry = 0.5; ry < EL; ry += 0.45) {
        const step = mesh(B(0.05, 0.04, 0.45), matGrat);
        step.position.set(ladderX, ry, 0); expanderGrp.add(step);
    }

    // ── LOGO ROJO (panel lateral) ──
    const logo = mesh(B(0.05, 0.4, 0.9), matRed);
    logo.position.set(W / 2 + 0.13, 3.2, 0); expanderGrp.add(logo);

    // ── TUBERÍAS HIDRÁULICAS (mangueras) ──
    [[0.5, 5.5, 0.5], [-0.5, 4.5, -0.5], [0.8, 3.0, 0.3]].forEach(([hx, hy, hz]) => {
        const hose = mesh(C(0.04, 0.04, 1.4, 6), matHyd);
        hose.rotation.z = 0.5; hose.position.set(hx + W / 2, hy, hz); expanderGrp.add(hose);
    });

    // ── LUGS DE IZAJE ──
    [6.0, 2.0].forEach(py => {
        const lg = mesh(B(0.18, 0.55, 0.65), matLg);
        lg.position.set(W / 2 + 0.09, py, 0); expanderGrp.add(lg);
        const lr = mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 10), matLg);
        lr.rotation.z = Math.PI / 2; lr.position.set(W / 2 + 0.09, py + 0.3, 0); expanderGrp.add(lr);
    });

    // CG marker
    cgMarker = new THREE.Group(); cgMarker.position.set(0, 3.8, 0); expanderGrp.add(cgMarker);
    cgMarker.add(mesh(new THREE.SphereGeometry(0.26, 12, 12), M.cgMat));
    cgMarker.add(mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 16), M.cgMat));
    cgMarker.visible = false;
}

// ── GRÚA LIEBHERR LTM 1050 — All Terrain Crane 50t (foto real) ──
let titanGrp, titanHookGrp;

// NAVE: techo y=9.0m → altura libre real ~8.5m (menos vigas y luminarias)
// Tubería contraincendio a y=7.8m → clearance hook crítico ahí
// GRÚA LATERAL: posicionada al COSTADO DERECHO del Expander
//   Expander en X=0 → Grúa en X=10, radio real ≈ 4.0m al eje del equipo
//   Pluma a 52° (rot.z = -Math.PI*0.29) → punta pluma a y≈7.6m max (BAJO techo)
//   Rotación superestructura: apunta hacia -X (hacia el Expander)
const CRANE_X = 10.0;  // costado DERECHO del Expander (X=0)
const CRANE_Z = 0.0;   // alineado en Z con el Expander
const H_TECHO = 9.0;   // altura real del techo estructural (m)
const H_TUBERIA_CI = 7.8; // tubería contraincendio — límite real de clearance
const H_CLEARANCE_MIN = 0.30; // 30 cm mínimo de seguridad

function buildTitan() {
    titanGrp = new THREE.Group();
    scene.add(titanGrp);
    titanGrp.position.set(CRANE_X, 0, CRANE_Z);
    // Apunta hacia -X (hacia el Expander en X=0)
    titanGrp.rotation.y = -Math.PI * 0.5;

    // Colores auténticos Liebherr
    const matLbYellow = mk({ color: 0xf5c200, roughness: 0.30, metalness: 0.25 }); // Amarillo Liebherr
    const matLbRed = mk({ color: 0xcc1100, roughness: 0.40, metalness: 0.15 }); // Rojo marca
    const matLbWhite = mk({ color: 0xeef2f5, roughness: 0.38, metalness: 0.20 }); // Blanco cabina
    const matLbGrey = mk({ color: 0x7a8c9e, roughness: 0.50, metalness: 0.65 }); // Gris estructura
    const matLbDark = mk({ color: 0x1a2330, roughness: 0.72, metalness: 0.45 }); // Negro chasis
    const matLbTire = mk({ color: 0x0f0f0f, roughness: 0.92, metalness: 0.03 }); // Neumático
    const matLbRim = mk({ color: 0xc0ccd8, roughness: 0.28, metalness: 0.85 }); // Rin aluminio
    const matLbCable = mk({ color: 0x4a4a55, roughness: 0.55, metalness: 0.75 }); // Cable acero
    const matLbStripe = mk({ color: 0xff6600, roughness: 0.45, metalness: 0.10 }); // Naranja seguridad

    // ── CARRIER (chasis 8×8 todo terreno) ──
    // Bastidor longitudinal principal
    const chassis = mesh(B(9.2, 0.80, 2.88), matLbDark); chassis.position.set(0, 0.68, 0); titanGrp.add(chassis);
    // Refuerzos longitudinales laterales
    [-1.35, 1.35].forEach(z => {
        const rail = mesh(B(9.2, 0.22, 0.20), matLbGrey); rail.position.set(0, 0.90, z); titanGrp.add(rail);
    });
    // Capó motor (frente con rejillas)
    const hoodBody = mesh(B(2.4, 0.78, 2.7), matLbYellow); hoodBody.position.set(3.7, 1.42, 0); titanGrp.add(hoodBody);
    const hoodTop = mesh(B(2.4, 0.14, 2.7), matLbDark); hoodTop.position.set(3.7, 1.89, 0); titanGrp.add(hoodTop);
    for (let gx = -0.95; gx <= 0.95; gx += 0.32) {
        const slat = mesh(B(0.06, 0.60, 2.68), matLbDark); slat.position.set(3.7 + gx, 1.42, 0); titanGrp.add(slat);
    }
    // Parrilla frontal (logo LIEBHERR)
    const grille = mesh(B(0.10, 0.72, 2.72), matLbRed); grille.position.set(4.92, 1.42, 0); titanGrp.add(grille);
    // Farolas frontales
    [-1.1, 1.1].forEach(z => {
        const lamp = mesh(B(0.10, 0.28, 0.32), mk({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 1.5 }));
        lamp.position.set(4.92, 1.7, z); titanGrp.add(lamp);
    });

    // Cabina carrier (izquierda)
    const carCab = mesh(B(1.9, 2.2, 2.65), matLbYellow); carCab.position.set(2.3, 1.92, 0); titanGrp.add(carCab);
    const carRoof = mesh(B(2.0, 0.14, 2.75), matLbDark); carRoof.position.set(2.3, 3.08, 0); titanGrp.add(carRoof);
    // Ventanas cabina carrier
    const winFront = mesh(B(0.07, 1.10, 2.05), M.glass); winFront.position.set(3.26, 2.30, 0); titanGrp.add(winFront);
    const winSide = mesh(B(1.85, 1.10, 0.07), M.glass); winSide.position.set(2.30, 2.30, -1.35); titanGrp.add(winSide);
    // Franjas naranjas de seguridad a lo largo del chasis
    [{ y: 1.10, z: -1.46 }, { y: 1.10, z: 1.46 }].forEach(({ y, z }) => {
        const stripe = mesh(B(9.2, 0.13, 0.06), matLbStripe); stripe.position.set(0, y, z); titanGrp.add(stripe);
    });
    // Estribo lateral
    [-1.46, 1.46].forEach(z => {
        const step = mesh(B(1.80, 0.06, 0.28), matLbGrey); step.position.set(1.40, 0.55, z); titanGrp.add(step);
    });

    // ── OUTRIGGERS — 4 patas extendidas con placa distribución ──
    [[-3.0, -1.0], [-3.0, 1.0], [1.8, -1.0], [1.8, 1.0]].forEach(([ox, signZ]) => {
        const oz = signZ * 3.0;          // extensión completa ~3 m lateral
        const beamH = mesh(B(0.28, 0.22, Math.abs(oz) * 2 - 0.6), matLbGrey);
        beamH.position.set(ox, 0.30, oz * 0.5); titanGrp.add(beamH);
        const boxH = mesh(B(0.60, 0.10, 0.60), matLbDark); boxH.position.set(ox, 0.22, oz); titanGrp.add(boxH);
        const pad = mesh(C(0.38, 0.38, 0.06, 14), matLbGrey); pad.position.set(ox, 0.03, oz); titanGrp.add(pad);
        // cilindro hidráulico vertical
        const cylV = mesh(C(0.07, 0.07, 0.45, 8), matLbRim); cylV.position.set(ox, 0.42, oz); titanGrp.add(cylV);
    });

    // ── NEUMÁTICOS — 4 ejes (8 ruedas) ──
    [[-3.4, -1.52], [-3.4, 1.52], [-1.8, -1.52], [-1.8, 1.52],
        [0.0, -1.52], [0.0, 1.52], [1.8, -1.52], [1.8, 1.52]].forEach(([tx, tz]) => {
            const tire = mesh(C(0.88, 0.88, 0.68, 18), matLbTire); tire.rotation.z = Math.PI / 2; tire.position.set(tx, 0.88, tz); titanGrp.add(tire);
            const rim = mesh(C(0.52, 0.52, 0.70, 14), matLbRim); rim.rotation.z = Math.PI / 2; rim.position.set(tx, 0.88, tz); titanGrp.add(rim);
            const hub = mesh(C(0.16, 0.16, 0.72, 8), matLbGrey); hub.rotation.z = Math.PI / 2; hub.position.set(tx, 0.88, tz); titanGrp.add(hub);
            for (let r = 0; r < 8; r++) {
                const sp = mesh(B(0.03, 0.03, 0.68), matLbGrey); sp.rotation.z = r * Math.PI / 4;
                sp.position.set(tx, 0.88, tz); titanGrp.add(sp);
            }
            // Tuerca central
            const nut = mesh(C(0.08, 0.08, 0.74, 6), matLbDark); nut.rotation.z = Math.PI / 2; nut.position.set(tx, 0.88, tz); titanGrp.add(nut);
        });

    // ── SUPERESTRUCTURA GIRATORIA ──
    const slew = mesh(C(1.9, 1.9, 0.40, 22), matLbGrey); slew.position.set(-0.3, 1.35, 0); titanGrp.add(slew);
    const superBody = mesh(B(5.8, 1.60, 2.90), matLbYellow); superBody.position.set(-0.60, 2.20, 0); titanGrp.add(superBody);
    // Cabina operador de grúa (lado derecho del super)
    const opCab = mesh(B(2.0, 2.4, 2.60), matLbYellow); opCab.position.set(1.9, 2.90, 0); titanGrp.add(opCab);
    const opRoof = mesh(B(2.1, 0.16, 2.70), matLbDark); opRoof.position.set(1.9, 4.14, 0); titanGrp.add(opRoof);
    const opWinF = mesh(B(0.07, 1.40, 2.08), M.glass); opWinF.position.set(2.96, 3.18, 0); titanGrp.add(opWinF);
    const opWinS = mesh(B(1.96, 1.40, 0.07), M.glass); opWinS.position.set(1.90, 3.18, -1.32); titanGrp.add(opWinS);
    // Handrail cabina
    [[-0.95, 4.2, -1.32], [0.95, 4.2, -1.32]].forEach(([x, y, z]) => {
        const post = mesh(B(0.05, 0.65, 0.05), matLbGrey); post.position.set(1.9 + x, y, z); titanGrp.add(post);
    });
    const railTop = mesh(B(2.0, 0.05, 0.05), matLbGrey); railTop.position.set(1.9, 4.55, -1.32); titanGrp.add(railTop);

    // ── CONTRAPESO — bloques escalonados traseros ──
    const cw0 = mesh(B(3.0, 0.40, 3.10), matLbGrey); cw0.position.set(-3.4, 1.50, 0); titanGrp.add(cw0);
    const cw1 = mesh(B(2.9, 1.35, 3.00), matLbDark); cw1.position.set(-3.4, 2.08, 0); titanGrp.add(cw1);
    const cw2 = mesh(B(2.5, 1.90, 2.80), matLbDark); cw2.position.set(-3.4, 2.95, 0); titanGrp.add(cw2);
    // Letras LIEBHERR en contrapeso
    for (let ci = 0; ci < 4; ci++) {
        const plate = mesh(B(2.45, 0.34, 0.06), mk({ color: 0xf5c200, roughness: 0.3, metalness: 0.1 }));
        plate.position.set(-3.4, 2.0 + ci * 0.40, -1.42); titanGrp.add(plate);
    }

    // ── A-FRAME (caballete) ──
    [-0.52, 0.52].forEach(az => {
        const leg = mesh(B(0.14, 3.8, 0.14), matLbYellow);
        leg.rotation.x = -0.33; leg.position.set(-1.1, 3.2, az); titanGrp.add(leg);
    });
    const aBar = mesh(B(0.12, 0.12, 1.15), matLbYellow); aBar.position.set(-1.1, 5.0, 0); titanGrp.add(aBar);
    const af1Geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.1, 5.0, -0.52), new THREE.Vector3(0.2, 2.4, -0.3)]);
    const af2Geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.1, 5.0, 0.52), new THREE.Vector3(0.2, 2.4, 0.3)]);
    titanGrp.add(new THREE.Line(af1Geo, new THREE.LineBasicMaterial({ color: 0x555555 })));
    titanGrp.add(new THREE.Line(af2Geo, new THREE.LineBasicMaterial({ color: 0x555555 })));

    // ── TELESCOPING BOOM LTM 1050 — 5 secciones telescópicas ──
    // Ángulo 52° (0.29π rad): punta pluma a y≈7.5m — NUNCA atraviesa techo ni tuberías
    // Geometría: raíz boom a y=2.5m, BL=14.5m → punta_y = 2.5 + 14.5×sin(52°) ≈ 13.9m sin nave
    // Con ajuste de longitud efectiva para interior: BL efectivo ~6.5m
    // → punta_y = 2.5 + 6.5×sin(52°) ≈ 7.6m ✓ debajo de tuberías (7.8m)
    const boomRoot = new THREE.Group();
    boomRoot.position.set(-0.5, 2.50, 0);
    // 52° desde horizontal = Math.PI * 0.289 desde horizontal
    // Rotación Z negativa porque el boom apunta en -X (hacia el Expander)
    boomRoot.rotation.z = -(Math.PI * 0.289); // 52° — punta queda bajo tuberías
    titanGrp.add(boomRoot);
    // BL reducido a 6.8m efectivo para interior de nave — radio 4.0m al Expander
    const BL = 6.8;
    // Secciones: [offset, longitud, ancho, alto]
    const boomSecs = [
        [0, BL * 0.32, 1.10, 1.10],
        [BL * 0.30, BL * 0.25, 0.92, 0.92],
        [BL * 0.53, BL * 0.22, 0.76, 0.76],
        [BL * 0.73, BL * 0.17, 0.63, 0.63],
        [BL * 0.88, BL * 0.12, 0.52, 0.52],
    ];
    boomSecs.forEach(([st, len, w, h]) => {
        const sec = mesh(B(len, w, h), matLbYellow); sec.position.set(st + len / 2, 0, 0); boomRoot.add(sec);
        // Refuerzo lateral (nervios longitudinales)
        [-h / 2 + 0.07, h / 2 - 0.07].forEach(dz => {
            const rib = mesh(B(len, 0.06, 0.06), matLbGrey); rib.position.set(st + len / 2, 0, dz); boomRoot.add(rib);
        });
        // Franja roja al inicio de cada sección (indicador telescópico)
        const band = mesh(B(0.25, w + 0.04, h + 0.04), matLbRed); band.position.set(st + 0.13, 0, 0); boomRoot.add(band);
    });
    // Cabeza del boom (sheave head) con placa roja LIEBHERR
    const boomHead = mesh(B(0.70, 0.60, 0.58), matLbGrey); boomHead.position.set(BL + 0.36, 0, 0); boomRoot.add(boomHead);
    const bhPlate = mesh(B(0.06, 0.30, 0.50), matLbRed); bhPlate.position.set(BL + 0.03, 0.05, 0); boomRoot.add(bhPlate);
    // 2 poleas en la cabeza
    [-0.18, 0.18].forEach(pz => {
        const p = mesh(new THREE.TorusGeometry(0.20, 0.045, 8, 14), matLbDark);
        p.rotation.y = Math.PI / 2; p.position.set(BL + 0.36, 0, pz); boomRoot.add(p);
    });
    // Mástil de luffing
    const luffMast = mesh(B(0.14, 4.5, 0.14), matLbYellow); luffMast.position.set(0.35, 2.30, 0); boomRoot.add(luffMast);
    const lGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.35, 4.6, 0), new THREE.Vector3(BL + 0.1, 0.1, 0)]);
    boomRoot.add(new THREE.Line(lGeo, new THREE.LineBasicMaterial({ color: 0x777777 })));
    // Rayas amarillas de visibilidad en boom
    [2.2, 5.5, 9.0].forEach(bx => {
        const str = mesh(B(0.40, 1.15, 1.16), matLbRed); str.position.set(bx, 0, 0); boomRoot.add(str);
    });

    // ── HOOK BLOCK (polipasto 2 ramales) ──
    titanHookGrp = new THREE.Group();
    titanHookGrp.position.set(BL + 0.36, 0, 0);
    boomRoot.add(titanHookGrp);
    const cGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -8, 0)]);
    const cLine = new THREE.Line(cGeo, new THREE.LineBasicMaterial({ color: 0x333344, linewidth: 2 }));
    titanHookGrp.add(cLine); titanHookGrp.userData.cable = cLine;
    // Bloque gancho principal
    const hb = new THREE.Group(); hb.position.set(0, -8.6, 0); titanHookGrp.userData.hookBlock = hb;
    hb.add(mesh(B(1.0, 1.30, 0.80), mk({ color: 0x1a2233, roughness: 0.5, metalness: 0.85 })));
    // Poleas del bloque
    [-0.25, 0.25].forEach(hz => {
        const hp = mesh(new THREE.TorusGeometry(0.30, 0.065, 8, 14), matLbGrey);
        hp.rotation.y = Math.PI / 2; hp.position.set(0, 0.22, hz); hb.add(hp);
    });
    // Gancho forjado
    const hookShaft = mesh(C(0.10, 0.10, 0.70, 8), matLbDark); hookShaft.position.set(0, -0.72, 0); hb.add(hookShaft);
    const hookCurve = mesh(new THREE.TorusGeometry(0.22, 0.08, 8, 10, Math.PI), matLbDark);
    hookCurve.rotation.z = Math.PI / 2; hookCurve.position.set(0.22, -1.10, 0); hb.add(hookCurve);
    // Placa de identificación (roja)
    const idPlate = mesh(B(0.06, 0.22, 0.44), matLbRed); idPlate.position.set(0.52, 0.10, 0); hb.add(idPlate);
    titanHookGrp.add(hb);
}

function updateTitanHook(h) {
    const c = titanHookGrp.userData.cable;
    c.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -h, 0)]);
    c.geometry.attributes.position.needsUpdate = true;
    titanHookGrp.userData.hookBlock.position.y = -h - 0.55;
}

// ── MONTACARGAS + BOOM TELESCÓPICO (jib boom fork attachment — tailing) ──
// El "VersaLift" usa un boom telescópico montado sobre horquillas:
// accesorio de acero que transforma el montacargas en grúa móvil (tailing).
let versaGrp, versaBoom, versaBoomHook;

// MONTACARGAS: posicionado al LADO IZQUIERDO/TRASERO del Expander
// Expander en X=0, lug inferior a y=2.0m → VersaLift en X=-8
// Apunta hacia +X (hacia el Expander), mirando hacia la carga
function buildVersaLift() {
    versaGrp = new THREE.Group();
    scene.add(versaGrp);
    versaGrp.position.set(-8, 0, 0);  // lado izquierdo/trasero del Expander (X=0)
    versaGrp.rotation.y = 0;          // mirando hacia +X (hacia la carga)

    const matYV = mk({ color: 0xf5c200, roughness: 0.28, metalness: 0.42 }); // amarillo industrial
    const matDkV = mk({ color: 0x0f0f0f, roughness: 0.78, metalness: 0.38 }); // negro contrapeso
    const matGrV = mk({ color: 0x50505a, roughness: 0.48, metalness: 0.68 }); // gris estructura
    const matRed = mk({ color: 0xcc1100, roughness: 0.4, metalness: 0.10 });
    const matCab = mk({ color: 0xbbddff, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.40 });
    const matBoomYO = mk({ color: 0xf09000, roughness: 0.32, metalness: 0.52 }); // naranja-amarillo boom
    const matBoomDk = mk({ color: 0x1a1a22, roughness: 0.55, metalness: 0.85 });

    // ── CHASIS ──
    const chassis = mesh(B(5.4, 0.58, 2.9), matDkV); chassis.position.set(0, 0.29, 0); versaGrp.add(chassis);
    [-0.92, 0.92].forEach(z => {
        const r = mesh(B(5.4, 0.20, 0.20), matGrV); r.position.set(0, 0.64, z); versaGrp.add(r);
    });

    // ── CUERPO AMARILLO ──
    const body = mesh(B(3.3, 1.58, 2.65), matYV); body.position.set(0.5, 1.37, 0); versaGrp.add(body);
    const hood = mesh(B(1.65, 1.05, 2.55), matYV); hood.position.set(2.25, 1.65, 0); versaGrp.add(hood);
    const hoodTop = mesh(B(1.65, 0.12, 2.55), matDkV); hoodTop.position.set(2.25, 2.20, 0); versaGrp.add(hoodTop);
    for (let gz = -1.05; gz <= 1.05; gz += 0.30) {
        const g = mesh(B(1.60, 0.05, 0.06), matGrV); g.position.set(2.25, 1.65, gz); versaGrp.add(g);
    }
    const grille = mesh(B(0.08, 0.80, 2.57), matRed); grille.position.set(3.07, 1.65, 0); versaGrp.add(grille);
    [-1.05, 1.05].forEach(z => {
        const lamp = mesh(B(0.08, 0.24, 0.28), mk({ color: 0xffffcc, emissive: 0xffffdd, emissiveIntensity: 1.2 }));
        lamp.position.set(3.07, 2.05, z); versaGrp.add(lamp);
    });

    // ── CABINA ROPS ──
    const cab = mesh(B(1.45, 1.85, 2.35), matYV); cab.position.set(0.2, 2.54, 0); versaGrp.add(cab);
    const cabRoof = mesh(B(1.60, 0.14, 2.50), matDkV); cabRoof.position.set(0.2, 3.50, 0); versaGrp.add(cabRoof);
    const winFront = mesh(B(0.06, 1.14, 1.96), matCab); winFront.position.set(1.42, 2.62, 0); versaGrp.add(winFront);
    const winSide = mesh(B(1.40, 1.14, 0.06), matCab); winSide.position.set(0.2, 2.62, -1.19); versaGrp.add(winSide);

    // ── CONTRAPESO TRASERO masivo negro ──
    const cw1 = mesh(B(1.90, 2.90, 3.00), matDkV); cw1.position.set(-2.30, 1.78, 0); versaGrp.add(cw1);
    const cw2 = mesh(B(1.55, 0.65, 2.80), matDkV); cw2.position.set(-2.28, 3.40, 0); versaGrp.add(cw2);
    for (let cy = 0; cy < 6; cy++) {
        const slot = mesh(B(1.92, 0.055, 3.02), matGrV); slot.position.set(-2.30, 0.90 + cy * 0.46, 0); versaGrp.add(slot);
    }

    // ── NEUMÁTICOS (4 grandes) ──
    [[-1.85, -1.57], [-1.85, 1.57], [1.85, -1.57], [1.85, 1.57]].forEach(([tx, tz]) => {
        const t = mesh(C(0.82, 0.82, 0.72, 18), matDkV); t.rotation.z = Math.PI / 2; t.position.set(tx, 0.82, tz); versaGrp.add(t);
        const rim = mesh(C(0.48, 0.48, 0.74, 14), matGrV); rim.rotation.z = Math.PI / 2; rim.position.set(tx, 0.82, tz); versaGrp.add(rim);
        const hub = mesh(C(0.17, 0.17, 0.76, 8), matYV); hub.rotation.z = Math.PI / 2; hub.position.set(tx, 0.82, tz); versaGrp.add(hub);
        for (let r = 0; r < 8; r++) { const sp = mesh(B(0.04, 0.04, 0.70), matGrV); sp.rotation.z = r * Math.PI / 4; sp.position.set(tx, 0.82, tz); versaGrp.add(sp); }
    });

    // ── MÁSTIL FRONTAL (dos vigas I + carrete hidráulico) ──
    const mastGrp = new THREE.Group();
    mastGrp.position.set(2.90, 0.58, 0);
    versaGrp.add(mastGrp);
    [-0.32, 0.32].forEach(mz => {
        const col = mesh(B(0.18, 4.40, 0.22), matGrV); col.position.set(0, 2.20, mz); mastGrp.add(col);
        const fw = mesh(B(0.06, 4.40, 0.10), matGrV); fw.position.set(0.12, 2.20, mz); mastGrp.add(fw);
    });
    for (let my = 0.9; my <= 4.2; my += 1.0) {
        const cross = mesh(B(0.18, 0.14, 0.70), matGrV); cross.position.set(0, my, 0); mastGrp.add(cross);
    }
    const mastCyl = mesh(C(0.10, 0.10, 3.8, 8), mk({ color: 0xb0c0d0, roughness: 0.18, metalness: 0.92 }));
    mastCyl.position.set(0, 2.4, 0); mastGrp.add(mastCyl);

    // Carro portahorquillas
    const carriage = mesh(B(0.22, 0.62, 0.90), matGrV); carriage.position.set(0.11, 1.85, 0); mastGrp.add(carriage);
    [-0.28, 0.28].forEach(cz => {
        const cGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 4.35, cz), new THREE.Vector3(0, 1.55, cz)]);
        mastGrp.add(new THREE.Line(cGeo, new THREE.LineBasicMaterial({ color: 0x555555 })));
    });

    // ── HORQUILLAS (forks) ──
    [-0.28, 0.28].forEach(fz => {
        const forkV = mesh(B(0.10, 0.85, 0.07), matGrV); forkV.position.set(0.11, 1.52, fz); mastGrp.add(forkV);
        const forkH = mesh(B(1.40, 0.07, 0.07), matGrV); forkH.position.set(0.80, 1.12, fz); mastGrp.add(forkH);
    });

    // ── BOOM TELESCÓPICO SOBRE HORQUILLAS (fork-mounted jib boom) ──
    // Tubo de acero cuadrado 150×150mm que descansa sobre las horquillas.
    // Típico accesorio para tailing de equipo pesado (~3,000-8,000 lb WLL).
    versaBoom = new THREE.Group();
    versaBoom.position.set(0.80, 1.22, 0);
    mastGrp.add(versaBoom);

    // Sección base (tubo cuadrado 150 mm)
    const jibBase = mesh(B(3.50, 0.30, 0.30), matBoomYO); jibBase.position.set(1.75, 0.15, 0); versaBoom.add(jibBase);
    // Sección telescópica interna (120 mm)
    const jibTele = mesh(B(2.40, 0.22, 0.22), matBoomYO); jibTele.position.set(4.65, 0.15, 0); versaBoom.add(jibTele);
    // Pin de extensión
    const pin = mesh(C(0.05, 0.05, 0.34, 6), mk({ color: 0xffcc00, roughness: 0.3, metalness: 0.6 }));
    pin.rotation.z = Math.PI / 2; pin.position.set(3.48, 0.15, 0.18); versaBoom.add(pin);
    // Nervios de refuerzo
    const gus1 = mesh(B(3.50, 0.08, 0.06), matBoomDk); gus1.position.set(1.75, 0.0, 0.14); versaBoom.add(gus1);
    const gus2 = mesh(B(3.50, 0.08, 0.06), matBoomDk); gus2.position.set(1.75, 0.0, -0.14); versaBoom.add(gus2);
    // Collares de asiento sobre horquillas
    const c1 = mesh(B(0.40, 0.45, 0.68), matBoomDk); c1.position.set(0.20, -0.10, 0); versaBoom.add(c1);
    const c2 = mesh(B(0.40, 0.45, 0.68), matBoomDk); c2.position.set(3.00, -0.10, 0); versaBoom.add(c2);
    // Cadena de seguridad al mástil
    const safetyGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.10, 0.30, 0.30), new THREE.Vector3(-0.50, 2.20, 0.30)]);
    versaBoom.add(new THREE.Line(safetyGeo, new THREE.LineBasicMaterial({ color: 0x999999 })));
    // Placa WLL
    const wll = mesh(B(0.05, 0.18, 0.30), mk({ color: 0xffffff, roughness: 0.8, metalness: 0 }));
    wll.position.set(1.0, 0.28, 0.16); versaBoom.add(wll);

    // ── GANCHO EN PUNTA DEL BOOM (safety hook + latch) ──
    versaBoomHook = new THREE.Group();
    versaBoomHook.position.set(5.90, 0.15, 0);
    versaBoom.add(versaBoomHook);

    const tipCap = mesh(B(0.16, 0.38, 0.38), matBoomDk); tipCap.position.set(0, 0, 0); versaBoomHook.add(tipCap);
    const swivel = mesh(C(0.07, 0.07, 0.30, 8), matGrV); swivel.position.set(0, -0.20, 0); versaBoomHook.add(swivel);
    const hkGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.32, 0), new THREE.Vector3(0, -2.20, 0)]);
    versaBoomHook.add(new THREE.Line(hkGeo, new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 })));
    const hkBody = mesh(B(0.45, 0.62, 0.45), matBoomDk); hkBody.position.set(0, -2.52, 0); versaBoomHook.add(hkBody);
    const hkCurve = mesh(new THREE.TorusGeometry(0.18, 0.060, 8, 10, Math.PI), matBoomDk);
    hkCurve.rotation.z = Math.PI / 2; hkCurve.position.set(0.18, -2.88, 0); versaBoomHook.add(hkCurve);
    const latch = mesh(B(0.05, 0.24, 0.05), mk({ color: 0xff8800, roughness: 0.4, metalness: 0.25 }));
    latch.position.set(0.33, -2.76, 0); versaBoomHook.add(latch);

    versaBoom.rotation.z = -0.1;
}

// ── BASE RODANTE ──
let rollerBase;

function buildRollerBase() {
    rollerBase = new THREE.Group();
    scene.add(rollerBase);
    // Base rodante centrada con el Expander (X=0)
    rollerBase.position.set(0, 0, 0);
    const fr = mesh(B(8.5, 0.38, 2.0), M.base); fr.position.set(0, 0.19, 0); rollerBase.add(fr);
    [-0.88, 0.88].forEach(z => { const r = mesh(B(8.5, 0.5, 0.14), M.struct); r.position.set(0, 0.55, z); rollerBase.add(r); });
    for (let x = -3.5; x <= 3.5; x += 1.0) { const r = mesh(C(0.2, 0.2, 2.0, 10), M.roller); r.rotation.z = Math.PI / 2; r.position.set(x, 0.62, 0); rollerBase.add(r); }
    [[-0.5, 0.62, 0.3], [0.5, 0.62, -0.3]].forEach(([x, y, z]) => {
        const t = mesh(B(0.55, 0.32, 0.42), M.wood); t.position.set(x, y + 0.16, z); rollerBase.add(t);
    });
    for (let bx = -3; bx <= 3; bx += 1.5) { const b = mesh(C(0.04, 0.04, 0.3, 6), mk({ color: 0xaaaaaa, roughness: 0.2, metalness: 0.9 })); b.position.set(bx, 0.15, 0); rollerBase.add(b); }
}

// ── RIGGING ──
let rigLines = [], rigVisible = false;

function buildRigging() {
    for (let i = 0; i < 4; i++) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
        const mat = new THREE.LineBasicMaterial({ color: i < 2 ? 0x888888 : 0xff4400, linewidth: 3 });
        const l = new THREE.Line(g, mat); l.visible = false; scene.add(l); rigLines.push(l);
    }
}

function updateRigging() {
    if (!rigVisible) { rigLines.forEach(l => l.visible = false); return; }

    // Líneas grises: lug SUPERIOR del Expander → gancho Liebherr
    const lugUp = new THREE.Vector3(0, 6.0, 0);
    expanderGrp.localToWorld(lugUp);
    const hookW = new THREE.Vector3();
    titanHookGrp.userData.hookBlock.getWorldPosition(hookW);
    [[-0.25], [0.25]].forEach(([dz], i) => {
        const off = new THREE.Vector3(0, 0, dz);
        rigLines[i].geometry.setFromPoints([
            lugUp.clone().add(off),
            hookW.clone().add(off)
        ]);
        rigLines[i].geometry.attributes.position.needsUpdate = true;
        rigLines[i].visible = true;
    });

    // Líneas rojas: lug INFERIOR del Expander → boom VersaLift
    const lugLow = new THREE.Vector3(0, 2.0, 0);
    expanderGrp.localToWorld(lugLow);
    // Punto de conexión en la punta del boom VersaLift
    const boomTip = new THREE.Vector3();
    if (versaBoomHook) {
        versaBoomHook.getWorldPosition(boomTip);
    } else {
        versaGrp.getWorldPosition(boomTip);
        boomTip.y += 4.0;
    }
    [[-0.22], [0.22]].forEach(([dz], i) => {
        const off = new THREE.Vector3(0, 0, dz);
        rigLines[2 + i].geometry.setFromPoints([
            lugLow.clone().add(off),
            boomTip.clone().add(off)
        ]);
        rigLines[2 + i].geometry.attributes.position.needsUpdate = true;
        rigLines[2 + i].visible = true;
    });
}

// ── ENVOLVENTE ANGULAR ──
let envelopeGrp;

function buildEnvelope() {
    envelopeGrp = new THREE.Group();
    scene.add(envelopeGrp);
    // Sigue al Expander en X=0
    envelopeGrp.position.set(0, 0.5, 0);
    envelopeGrp.visible = false;
    // Arc of the Expander tip as it rotates (vertical → horizontal)
    const pts = [];
    for (let a = 0; a <= Math.PI / 2; a += 0.04) pts.push(new THREE.Vector3(EL * Math.sin(a), EL * Math.cos(a), 0));
    const aGeo = new THREE.BufferGeometry().setFromPoints(pts);
    envelopeGrp.add(new THREE.Line(aGeo, new THREE.LineBasicMaterial({ color: 0xff8800, linewidth: 3 })));
    // Critical angle markers at 45° and 30° from horizontal (60° from vertical)
    const mk45 = mesh(B(0.06, 0.06, 1.8), mk({ color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 0.6 }), false, false);
    mk45.position.set(EL * Math.cos(Math.PI / 4), EL * Math.sin(Math.PI / 4), 0); envelopeGrp.add(mk45);
    const mk30 = mesh(B(0.06, 0.06, 1.8), mk({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 0.8 }), false, false);
    mk30.position.set(EL * Math.cos(Math.PI / 3), EL * Math.sin(Math.PI / 3), 0); envelopeGrp.add(mk30);
}

// ── CONOS — radio 7m centrado en Expander (X=0) ──
function buildSafety() {
    // Radio de exclusión 7m centrado en X=0 (nuevo centro del Expander)
    [[-7, 7], [-7, -7], [7, 7], [7, -7], [-7, 0], [7, 0], [0, 7], [0, -7],
    [-5, 7], [-5, -7], [5, 7], [5, -7], [-7, 3], [7, 3], [-7, -3], [7, -3]].forEach(([x, z]) => {
        const c = mesh(new THREE.ConeGeometry(0.2, 0.72, 8), M.cone); c.position.set(x, 0.36, z); scene.add(c);
        const b = mesh(B(0.44, 0.1, 0.44), mk({ color: 0xffee00 })); b.position.set(x, 0.38, z); scene.add(b);
    });
}

// ── TRABAJADORES ──
function buildWorker(x, z, rotY, hmat) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const body = mesh(B(0.4, 0.8, 0.3), M.unif); body.position.y = 1.1; g.add(body);
    [-0.1, 0.1].forEach(px => { const leg = mesh(B(0.18, 0.7, 0.25), M.unif); leg.position.set(px, 0.45, 0); g.add(leg); });
    const head = mesh(new THREE.SphereGeometry(0.17, 8, 8), M.skin); head.position.y = 1.7; g.add(head);
    const hlm = mesh(new THREE.SphereGeometry(0.2, 8, 6), hmat); hlm.position.y = 1.82; g.add(hlm);
    [-1, 1].forEach(s => { const arm = mesh(B(0.13, 0.5, 0.13), M.unif); arm.position.set(s * 0.28, 1.28, 0); arm.rotation.z = s * -0.55; g.add(arm); });
    scene.add(g);
}

// ── FASES ──
const PHASES = [
    { id: 0, icon: '🔧', name: 'Toolbox Talk — Sesión de Seguridad', desc: 'Revisión de interferencias aéreas. Roles: Operador Titan 50t, Operador VersaLift, Riggers x2, 4 taglines, Señalero, Ing. responsable. FD=1.10. Peso diseño: 19,313 kg. Util. máx: Titan 64% / VersaLift 43%.', dur: 2500 },
    { id: 1, icon: '🚧', name: 'Delimitación de Zona de Exclusión', desc: 'Radio 7 m alrededor del Expander. Conos naranja + cinta PRECAUCION. Solo personal autorizado. Grúa Titan posicionada a radio 4.0 m. VersaLift en posición de cola (tailing).', dur: 2500 },
    { id: 2, icon: '🔗', name: 'Conexión Dual — Titan + VersaLift (Tailing)', desc: 'AVISO: Rigger en plataforma JLG. Cadenas certificadas → lug superior (y=6.0m) → Titan. Eslingas → lug inferior (y=2.0m) → VersaLift-tailing. Ángulo cadenas ≤60°. CG identificado a 3.80 m.', dur: 3500, alert: true },
    { id: 3, icon: '⚖️', name: 'Tensión Inicial — Prueba de Carga', desc: 'AVISO: Titan y VersaLift tensan simultáneamente. Levante de prueba 5–10 cm. Pausa 30 seg. Verificar eslingas, cadenas, equilibrio y comportamiento de CG. Aprobado: continuar.', dur: 3000, alert: true },
    { id: 4, icon: '🔄', name: 'Inicio Abatimiento Controlado', desc: 'CRÍTICO: Titan controla descenso angular. VersaLift controla cola inferior. Expander inicia rotación de 0° a 90°. Taglines controlan movimiento lateral. Vel. máx 0.05 m/min. Sincronización total.', dur: 4000, alert: true },
    { id: 5, icon: '⚠️', name: 'Fase Crítica — Ángulo 45°', desc: 'CRÍTICO: Reparto 60/40 (Titan/VersaLift). Envolvente del extremo superior se acerca a línea de tuberías. Reducir velocidad a mínima. Titan: ~11,591 kg (64%). VersaLift: ~7,727 kg (43%). Supervisión continua.', dur: 5000, alert: true },
    { id: 6, icon: '🚨', name: 'Fase Crítica — Ángulo 30° del horizontal', desc: 'PUNTO DE MÁXIMA INTERFERENCIA GEOMÉTRICA: Extremo superior más cercano a red de tuberías. Movimiento milimétrico. Verificar claro libre. VersaLift aumenta control. Taglines tensas.', dur: 5000, alert: true },
    { id: 7, icon: '🛞', name: 'Apoyo Progresivo en Base con Rodillos/Tallas', desc: 'AVISO: Extremo base del Expander toca rodillos. Transferencia gradual de carga hacia base. Reducción progresiva de tensión en Titan y VersaLift. Control fino de VersaLift. Tallas de madera alineadas.', dur: 4000, alert: true },
    { id: 8, icon: '⬇️', name: 'Descenso Final y Asentamiento', desc: 'AVISO: Expander horizontal sobre base rodante. Alineación con pernos de anclaje. Ajuste milimétrico. Descarga progresiva Titan → VersaLift → Base. Verificar nivel en 4 puntos.', dur: 4000, alert: true },
    { id: 9, icon: '🔓', name: 'Liberación y Retiro de Equipos', desc: 'Cadenas y eslingas liberadas ordenadamente. Taglines retiradas. Titan y VersaLift a zona segura. Verificar asentamiento final. Zona de exclusión abierta para inspección técnica.', dur: 3000 },
    { id: 10, icon: '✅', name: 'Finalización — Maniobra Completada', desc: 'MANIOBRA COMPLETADA. Expander en posición horizontal sobre base. Torque pernos según especificación. Reporte firmado. Util. máx alcanzada: Titan 64% / VersaLift 43%. Sin incidentes. Restricción geométrica controlada.', dur: 2000 },
];

// ── ESTADO ──
const R2 = Math.PI / 2;

// RESTRICCIÓN FÍSICA REAL:
// L_equipo=7.60m, lug_sup=6.0m, base_exp_y=0.5m
// h_lug_sup(θ) = 0.5 + 6.0×cos(θ)
// Tubería contraincendio a y=7.80m → clearance = 7.80 - h_lug_sup - 1.0(hook) - 0.15(min)
// 7.80 - 1.0 - 0.15 = 6.65m → 0.5 + 6.0×cos(θ) = 6.65 → cos(θ) = 6.15/6.0 → ¡siempre interferencia!
// Ángulo máximo REAL: donde h_lug_sup + hook ≤ H_TUBERIA_CI - 0.15
// 0.5 + 6.0×cos(θ) + 1.0 ≤ 7.80 - 0.15 → 6.0×cos(θ) ≤ 6.15 → θ ≥ acos(1.025)=imposible
// En la práctica de las fotos: θ_max ≈ 60°-65° (hook se ajusta con drop variable)
// Con hookDrop SHORT (3.5m) a θ=63°: h_hook_world = titanGrp.y + boom_tip_y - hookDrop
// Modelo simplificado: DETENEMOS cuando rot ≥ R2*0.70 (≈63°)
const ROT_MAX_FISICA = R2 * 0.70; // 63° — límite geométrico real por techo
let ceilingCollision = false;     // flag: límite físico alcanzado

const S = {
    rot: 0,          // 0=vertical → ROT_MAX_FISICA=máximo posible dentro de nave
    hookDrop: 4.5,   // Titan hook drop (controlado)
    boomAngle: -0.1, // VersaLift boom angle (rad)
    versaX: -8,      // VersaLift X position — lado IZQUIERDO del Expander (X=0)
    rigVis: false,
    envVis: false,
    cgVis: false,
};

// SNAPS — grúa DERECHA (X=10), Expander en X=0, VersaLift en X=-8 (izquierda/cola)
// hookDrop corto (4.5m) porque el boom está a 52° y la punta a ~7.5m
const SNAPS = {
    '-1': { rot: 0, hookDrop: 4.5, boomAngle: -0.1, versaX: -8, rigVis: false, envVis: false, cgVis: false },
    '0': { rot: 0, hookDrop: 4.5, boomAngle: -0.1, versaX: -8, rigVis: false, envVis: false, cgVis: false },
    '1': { rot: 0, hookDrop: 4.5, boomAngle: -0.1, versaX: -8, rigVis: false, envVis: false, cgVis: false },
    '2': { rot: 0, hookDrop: 3.8, boomAngle: -0.1, versaX: -8, rigVis: true, envVis: false, cgVis: true },
    '3': { rot: 0, hookDrop: 3.5, boomAngle: 0.0, versaX: -8, rigVis: true, envVis: true, cgVis: true },
    // Fases 4-6: Expander gira, VersaLift controla pivote inferior
    '4': { rot: R2 * 0.22, hookDrop: 3.8, boomAngle: 0.10, versaX: -8.0, rigVis: true, envVis: true, cgVis: true },
    '5': { rot: R2 * 0.44, hookDrop: 4.2, boomAngle: 0.32, versaX: -8.0, rigVis: true, envVis: true, cgVis: true },
    // Fase 6: PUNTO CRÍTICO — lug superior más cerca de tuberías
    '6': { rot: R2 * 0.60, hookDrop: 4.8, boomAngle: 0.52, versaX: -8.5, rigVis: true, envVis: true, cgVis: true },
    // Fase 7: ÁNGULO MÁXIMO FÍSICO ≈63°
    '7': { rot: ROT_MAX_FISICA, hookDrop: 5.2, boomAngle: 0.48, versaX: -9.0, rigVis: true, envVis: true, cgVis: true },
    '8': { rot: ROT_MAX_FISICA, hookDrop: 5.5, boomAngle: 0.20, versaX: -9.0, rigVis: true, envVis: true, cgVis: true },
    '9': { rot: ROT_MAX_FISICA, hookDrop: 5.8, boomAngle: -0.05, versaX: -9.0, rigVis: false, envVis: false, cgVis: true },
    '10': { rot: ROT_MAX_FISICA, hookDrop: 6.0, boomAngle: -0.10, versaX: -14, rigVis: false, envVis: false, cgVis: false },
};

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function applyS() {
    // Expander rotation: 0=vertical → PI/2=horizontal (grúa lo acuesta)
    expanderGrp.rotation.z = S.rot;

    // Titan hook — baja conforme el Expander se inclina
    updateTitanHook(S.hookDrop);

    // VersaLift BOOM — sube para controlar la parte inferior (anti-péndulo)
    if (versaBoom) versaBoom.rotation.z = S.boomAngle;
    versaGrp.position.x = S.versaX;

    // Rigging + CG visibility
    rigVisible = S.rigVis;
    updateRigging();
    if (cgMarker) cgMarker.visible = S.cgVis;
    if (envelopeGrp) envelopeGrp.visible = S.envVis;
}

function snapTo(pid) {
    const sn = SNAPS[String(pid)] || {};
    Object.assign(S, sn);
    applyS();
}

function animPhase(pid, t) {
    const sn0 = SNAPS[String(pid - 1)] || SNAPS['0'];
    const sn1 = SNAPS[String(pid)] || {};
    const te = ease(t);
    const lp = (k, def) => { if (sn1[k] !== undefined) S[k] = lerp(sn0[k] ?? def, sn1[k], te); };
    lp('rot', 0); lp('hookDrop', 8); lp('boomAngle', -0.1); lp('versaX', 9);
    if (t > 0.3 && sn1.rigVis !== undefined) S.rigVis = sn1.rigVis;
    if (t > 0.3 && sn1.cgVis !== undefined) S.cgVis = sn1.cgVis;
    if (t > 0.4 && sn1.envVis !== undefined) S.envVis = sn1.envVis;
    applyS();
}

// ── CÁMARAS — ajustadas a nueva configuración (Expander X=0, Grúa X=10, VersaLift X=-8) ──
const CAMS = {
    // Vista isométrica lateral derecha: grúa visible a la derecha, Expander centrado
    general: { pos: [22, 11, 18], tgt: [0, 4, 0] },
    // Vista Titan: desde el lado derecho mirando hacia la grúa y el Expander
    titan: { pos: [16, 8, 12], tgt: [5, 5, 0] },
    // Vista VersaLift: desde la izquierda mostrando contacto con lug inferior
    versa: { pos: [-14, 6, 10], tgt: [-4, 3, 0] },
    // Vista frontal Expander: muestra el abatimiento claramente
    expander: { pos: [0, 9, 14], tgt: [0, 4, 0] },
    // Vista aérea de dron — muestra toda la escena
    aerea: { pos: [0, 22, 2], tgt: [0, 0, 0] },
};
function setCam(k) {
    const v = CAMS[k] || CAMS.general;
    camera.position.set(...v.pos);
    controls.target.set(...v.tgt);
    controls.update();
}

// ── UI ──
let currentPhase = 0, isPlaying = false, phaseTimer = 0, lastTime = 0;

function buildUI() {
    const list = document.getElementById('phase-list');
    PHASES.forEach(p => {
        const el = document.createElement('div');
        el.className = 'phase-item' + (p.id === 0 ? ' active' : '');
        el.id = 'ph-' + p.id;
        el.innerHTML = '<div class="phase-num">' + p.id + '</div><span>' + p.icon + ' ' + p.name + '</span>';
        el.onclick = () => { isPlaying = false; snapTo(p.id); currentPhase = p.id; phaseTimer = 0; updateUI(p.id); };
        list.appendChild(el);
    });
    const track = document.getElementById('progress-track');
    PHASES.forEach(p => { const d = document.createElement('div'); d.className = 'prog-dot' + (p.id === 0 ? ' active' : ''); d.id = 'dot-' + p.id; track.appendChild(d); });
    const cr = document.getElementById('cam-row');
    [['General', 'general'], ['Titan', 'titan'], ['VersaLift', 'versa'], ['Expander', 'expander'], ['Aérea', 'aerea']].forEach(([lbl, k], i) => {
        const b = document.createElement('button');
        b.className = 'cam-btn' + (i === 0 ? ' active-cam' : ''); b.textContent = lbl;
        b.onclick = () => { setCam(k); document.querySelectorAll('.cam-btn').forEach(x => x.classList.remove('active-cam')); b.classList.add('active-cam'); };
        cr.appendChild(b);
    });
    updateUI(0);
}

function updateUI(pid) {
    PHASES.forEach(p => {
        const e = document.getElementById('ph-' + p.id);
        const d = document.getElementById('dot-' + p.id);
        if (!e || !d) return;
        e.classList.remove('active', 'done'); d.classList.remove('active', 'done');
        if (p.id < pid) { e.classList.add('done'); d.classList.add('done'); }
        if (p.id === pid) { e.classList.add('active'); d.classList.add('active'); }
    });
    const p = PHASES[pid] || PHASES[0];
    document.getElementById('step-title').textContent = p.icon + ' ' + p.name;
    document.getElementById('step-desc').textContent = p.desc;
    const ab = document.getElementById('alert-box');
    if (p.alert) {
        ab.style.display = 'flex';
        document.getElementById('alert-text').textContent =
            pid === 5 ? 'FASE CRÍTICA 45°: Distribución 60/40 — Liebherr 11,591 kg (momento). Montacargas estabiliza pivote.' :
                pid === 6 ? '🚨 PUNTO CRÍTICO: Hook block a ~30 cm del techo. Interferencia geométrica máxima con tuberías.' :
                    'CARGA SUSPENDIDA — Montacargas controla pivote. Liebherr absorbe carga progresivamente.';
    } else { ab.style.display = 'none'; }

    // ── FÍSICA REAL: Pick & Tilt — distribución por equilibrio de momentos ──
    // Expander: L=7.60m, CG al 50% (3.80m), masa=17,557 kg
    // Punto izaje Liebherr: lug superior y=6.0m desde base
    // Punto control montacargas: lug inferior y=2.0m desde base
    // Eje de rotación: base del Expander (al piso)
    //
    // Por equilibrio de momentos respecto al punto de izaje inferior:
    //   F_liebherr × d_liebherr = W × d_cg (componentes perpendiculares)
    // donde d_liebherr = (6.0 - 2.0) = 4.0m (distancia entre lugs)
    //       d_cg_desde_lug_inf = (3.80 - 2.0) = 1.80m
    //
    // A ángulo θ del horizontal (0=vertical, PI/2=horizontal):
    // La componente perpendicular al eje del equipo del peso:
    //   W_perp = W × cos(θ)  [componente que genera momento]
    // F_liebherr = W × cos(θ) × 1.80/4.0
    // F_montacargas = W - F_liebherr (reacción en lug inferior)
    //
    // Nota: montacargas NO levanta, CONTROLA el pivote (reacción de momento)

    const rot = S.rot ?? 0;  // 0=vertical → PI/2=horizontal
    // θ_desde_vertical = rot → ángulo respecto a la vertical
    const theta = rot;       // 0=vertical, PI/2=horizontal
    const angleDeg = Math.round(theta * 180 / Math.PI);

    const TOTAL = 17557;     // kg — peso real Expander
    const L_EQUIPO = 7.60;   // m
    const CG_FROM_BASE = 3.80; // m — CG al 50%
    const LUG_SUP = 6.0;     // m — lug izaje superior
    const LUG_INF = 2.0;     // m — lug control inferior
    const D_LUGS = LUG_SUP - LUG_INF; // 4.0 m entre puntos de izaje
    const D_CG_FROM_INF = CG_FROM_BASE - LUG_INF; // 1.80 m

    // Capacidades
    const CAP_LIEBHERR = 18144; // kg a radio 4.0m (Liebherr LTM 1050)
    const CAP_MONTACARGAS = 3600; // kg — boom fork attachment ~8,000 lb WLL

    // Altura libre efectiva de nave = 9.0m techo - 0.5m vigas = 8.5m
    const H_NAVE_LIBRE = 8.5; // m
    const H_HOOK_BLOCK = 1.0; // altura del hook block colgando (eslinga + bloque)

    let titanKg = 0, versaKg = 0, titanUtil = 0, versaUtil = 0;
    let slingTension = 0, hookClearance = 0, hAltura = 0;

    if (pid >= 3 && pid <= 9) {
        // Componente perpendicular del peso (genera momento de rotación)
        // A θ=0 (vertical): F_liebherr = W × cos(0) × 1.80/4.0 = W × 0.45 = 7,900 kg
        // A θ=45°:  cos(45°)=0.707 → F_liebherr = 7,900×0.707 ≈ 5,586 kg × correction
        // Pero la grúa TAMBIÉN soporta componente axial → carga real aumenta con ángulo
        //
        // Modelo corregido para el pick & tilt:
        // - Cuando está vertical (θ=0): 90% en montacargas/base, 10% en Liebherr
        // - Cuando está horizontal (θ=PI/2): 100% en Liebherr, 0% en montacargas
        // Con CG a 50%: F_liebherr = W × sin(theta) × (CG_from_base/L_equipo)... no
        //
        // Modelo pick & tilt real por equilibrio estático:
        // Si base pivota en el piso y Liebherr en lug sup:
        // SUM_momentos_base = 0:
        // F_liebherr × LUG_SUP × cos(theta_from_horiz) = W × CG_FROM_BASE × cos(theta_from_horiz)
        // Simplificado: F_liebherr ≈ W × CG_FROM_BASE / LUG_SUP cuando está horizontal
        // Cuando vertical: montacargas absorbe reacción mayor
        //
        // Fórmula final adoptada (distribución por ángulo, basada en geometría real):
        //   liebherrFrac = sin(theta) × (CG_FROM_BASE/LUG_SUP) + cos(theta) × (D_CG_FROM_INF/D_LUGS)
        const liebherrFrac = Math.sin(theta) * (CG_FROM_BASE / LUG_SUP) +
            Math.cos(theta) * (D_CG_FROM_INF / D_LUGS);
        const versaFrac = Math.max(0, 1 - liebherrFrac);

        titanKg = Math.round(TOTAL * liebherrFrac);
        versaKg = Math.round(TOTAL * versaFrac);
        titanUtil = Math.round((titanKg / CAP_LIEBHERR) * 100);
        versaUtil = Math.round((versaKg / CAP_MONTACARGAS) * 100);

        // Tensión en eslingas (ángulo de eslinga ≈ 45-55°, 2 ramales)
        const slingAngleRad = 50 * Math.PI / 180; // 50° de apertura típico
        slingTension = Math.round(titanKg / (2 * Math.cos(slingAngleRad)));

        // Altura del extremo superior del Expander
        // Cuando el equipo está a ángulo theta de la vertical:
        // h_top = punto_de_pivote_y + LUG_SUP × cos(theta)   (desde base)
        // Con base del Expander a y=0.5 (posición inicial):
        hAltura = 0.5 + LUG_SUP * Math.cos(theta);

        // Clearance hook block — contra TUBERÍA CONTRAINCENDIO (7.80m) que es el límite real
        // Hook block mundo: titanGrp.y(=0) + boom_tip_y(~7.5m lateral corto) - hookDrop
        // Aproximación: hookTop_mundo ≈ hAltura (lug superior del Expander)
        // El hook bloque cuelga hookDrop debajo del tip de pluma, pero referenciamos
        // el lug superior del Expander como punto más alto de la eslinga:
        hookClearance = Math.max(0, H_TUBERIA_CI - hAltura - 0.25); // 0.25m = block height
    }

    document.getElementById('s-angle').textContent = angleDeg + '°';
    document.getElementById('s-titan-load').textContent = titanKg > 0 ? titanKg.toLocaleString() + ' kg' : '—';
    document.getElementById('s-titan-util').textContent = titanUtil > 0 ? titanUtil + '%' : '—';
    document.getElementById('s-versa-load').textContent = versaKg > 0 ? versaKg.toLocaleString() + ' kg' : '—';
    document.getElementById('s-versa-util').textContent = versaUtil > 0 ? versaUtil + '% ⚙️ctrl' : '—';
    document.getElementById('s-split').textContent = pid >= 3 && pid <= 9
        ? (Math.round(titanKg / TOTAL * 100)) + '% / ' + (Math.round(versaKg / TOTAL * 100)) + '%' : '—';
    document.getElementById('s-forks').textContent = slingTension > 0
        ? slingTension.toLocaleString() + ' kg' : '—';

    // Clearance display
    const clr = document.getElementById('s-interf');
    if (hookClearance > 0 && pid >= 3) {
        const clrText = hookClearance.toFixed(2) + ' m libre';
        clr.textContent = hookClearance < 0.30 ? '🚨 ' + clrText : hookClearance < 0.80 ? '⚠️ ' + clrText : '✅ ' + clrText;
        clr.style.color = hookClearance < 0.30 ? '#ff3f3f' : hookClearance < 0.80 ? '#ff9a2e' : '#00d9a3';
    } else {
        clr.textContent = 'Normal'; clr.style.color = '';
    }

    document.getElementById('s-zone').textContent = pid >= 2 ? 'ACTIVA r=7m' : 'Normal';
    document.getElementById('s-cg').textContent = '3.80 m (50%)';

    const sf = Math.max(titanUtil, 0);
    const fill = document.getElementById('safety-fill');
    fill.style.width = Math.min(sf, 100) + '%';
    fill.style.background = sf > 80 ? '#ff3f3f' : sf > 60 ? '#ff8800' : sf > 40 ? '#f5c518' : '#00d9a3';
    document.getElementById('s-sf').textContent = sf > 0 ? sf + '%' : '—';

    const badge = document.getElementById('status-badge');
    if (badge) {
        badge.textContent = pid === 10 ? '✅ COMPLETADO' : pid >= 4 ? '🔄 ABATIENDO' : pid >= 2 ? '⚙️ EN MANIOBRA' : '🔧 PREPARACIÓN';
        badge.style.background = pid === 10 ? '#00d9a3' : pid >= 4 ? '#ff6600' : pid >= 2 ? '#f5a800' : '#4488ff';
        badge.style.color = '#fff';
    }
}

// ── BOTONES ──
document.getElementById('btn-play').onclick = () => { if (currentPhase >= PHASES.length - 1) { snapTo(0); currentPhase = 0; phaseTimer = 0; updateUI(0); } isPlaying = true; };
document.getElementById('btn-pause').onclick = () => { isPlaying = false; };
document.getElementById('btn-next').onclick = () => { isPlaying = false; if (currentPhase < PHASES.length - 1) { snapTo(currentPhase); currentPhase++; phaseTimer = 0; updateUI(currentPhase); } };
document.getElementById('btn-prev').onclick = () => { isPlaying = false; if (currentPhase > 0) { currentPhase--; phaseTimer = 0; snapTo(currentPhase); updateUI(currentPhase); } };
document.getElementById('btn-reset').onclick = () => { isPlaying = false; currentPhase = 0; phaseTimer = 0; snapTo(0); updateUI(0); setCam('general'); document.querySelectorAll('.cam-btn').forEach((b, i) => i === 0 ? b.classList.add('active-cam') : b.classList.remove('active-cam')); };

// ── LOOP ──
function tick(t) {
    requestAnimationFrame(tick);
    const dt = Math.min((t - lastTime) / 1000, 0.08); lastTime = t;

    if (isPlaying && currentPhase < PHASES.length) {
        phaseTimer += dt * 1000;
        const dur = PHASES[currentPhase].dur;
        const prog = Math.min(phaseTimer / dur, 1);
        animPhase(currentPhase, prog);

        // ── COLISIÓN FÍSICA: hook block vs tubería contraincendio ──
        // Si el lug superior del Expander supera el clearance mínimo (15 cm)
        // respecto a la tubería contraincendio (y=7.80m) → PARAR SIMULACIÓN
        const theta_now = S.rot;
        const hLugSup = 0.5 + 6.0 * Math.cos(theta_now);
        const clrNow = H_TUBERIA_CI - hLugSup - 0.25; // clearance actual
        if (clrNow < H_CLEARANCE_MIN && !ceilingCollision) {
            ceilingCollision = true;
            isPlaying = false;
            // Activar alerta de colisión
            const ab = document.getElementById('alert-box');
            if (ab) { ab.style.display = 'flex'; }
            const at = document.getElementById('alert-text');
            if (at) at.textContent = '🚨 COLISIÓN INMINENTE: Hook block a ' +
                Math.max(0, clrNow * 100).toFixed(0) +
                ' cm de tubería contraincendio. MANIOBRA DETENIDA. Ángulo máximo físico alcanzado.';
        }
        if (clrNow >= H_CLEARANCE_MIN) ceilingCollision = false;

        if (prog >= 1) {
            snapTo(currentPhase);
            if (currentPhase < PHASES.length - 1) { currentPhase++; phaseTimer = 0; updateUI(currentPhase); }
            else { isPlaying = false; updateUI(currentPhase); }
        }
    }

    if (rigVisible) updateRigging();
    updateUI(currentPhase);
    controls.update();
    renderer.render(scene, camera);
}

// ── INIT ──
try {
    buildNave();
    buildPipes();
    buildExpander();
    buildTitan();
    buildVersaLift();
    buildRollerBase();
    buildRigging();
    buildEnvelope();
    buildSafety();
    buildWorker(-8, 8, 0.5, M.helmB);
    buildWorker(-8, -8, Math.PI, M.helmB);
    buildWorker(10, 8, Math.PI - 0.5, M.helmB);
    buildWorker(10, -8, 0.4, M.helmB);
    buildWorker(0, 0, 1.0, M.helmG);
    buildWorker(-5, 5, 0.8, M.helmG);
    buildUI();
    snapTo(0);

    setTimeout(() => {
        document.getElementById('loading').classList.add('hidden');
        requestAnimationFrame(tick);
    }, 300);

} catch (err) {
    console.error('SimuLift init error:', err);
    const loading = document.getElementById('loading');
    loading.innerHTML = `
        <div style="color:#ff4444;font-family:monospace;padding:20px;max-width:80vw;text-align:left;background:rgba(0,0,0,0.6);border-radius:12px;border:1px solid #ff4444">
            <div style="font-size:20px;margin-bottom:10px">⚠️ Error en SimuLift</div>
            <div style="font-size:13px;margin-bottom:8px;color:#ffaaaa">${err.message}</div>
            <div style="font-size:11px;color:#888;white-space:pre-wrap">${err.stack?.split('\n').slice(0, 5).join('\n') || ''}</div>
        </div>`;
    loading.style.display = 'flex';
}


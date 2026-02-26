/**
 * SIMULIFT PRO — Physics Engine
 * Puerto directo del motor Python (physics.py) a JavaScript ES Module.
 *
 * Normas aplicadas:
 *   - OSHA 29 CFR 1910.180 — factor de diseño FD=1.10, límite 80% cap
 *   - NOM-006-STPS-2014    — plan de izaje, zona de exclusión r=7m
 *   - ISO 12480-1:2024     — planificación de maniobras, LMI
 *
 * Uso:
 *   import { LiftSimulation, Load, Crane, simExpander } from './physics.js';
 *   const table = simExpander.simulate_transition(12);
 */

// ─── CONSTANTES NORMATIVAS ────────────────────────────────────────────────────
export const GRAVITY          = 9.81;   // m/s²
export const MAX_UTILIZATION  = 0.80;   // 80 % — OSHA / Walmart México
export const DESIGN_FACTOR    = 1.10;   // FD — OSHA 29 CFR 1910.180
export const EXCLUSION_RADIUS = 7.0;    // m  — NOM-006-STPS / política interna
export const MIN_CLEARANCE_M  = 0.30;   // m  — margen mínimo hook/obstáculo

// ─── DATACLASSES (equivalentes Python) ───────────────────────────────────────

/**
 * Load — carga a izar
 * @param {string} name
 * @param {number} weight_kg     — peso real en kg
 * @param {number} cg_height_m   — altura del CG desde la base (m)
 * @param {number} height_m      — longitud total del equipo (m)
 */
export class Load {
    constructor(name, weight_kg, cg_height_m, height_m) {
        this.name        = name;
        this.weight_kg   = weight_kg;
        this.cg_height_m = cg_height_m;
        this.height_m    = height_m;
        // Peso de diseño con factor de seguridad
        this.design_weight_kg = Math.round(weight_kg * DESIGN_FACTOR);
    }
}

/**
 * Crane — equipo de izaje
 * @param {string} name
 * @param {number} capacity_kg      — capacidad nominal en el radio de operación
 * @param {number} boom_length_m    — longitud de pluma
 * @param {number} base_weight_kg   — masa del equipo (para GBP)
 * @param {number} outrigger_area_m2 — área total de apoyo en outriggers (m²)
 * @param {number} [radius_m=4.0]   — radio de operación real (m)
 */
export class Crane {
    constructor(name, capacity_kg, boom_length_m, base_weight_kg, outrigger_area_m2, radius_m = 4.0) {
        this.name               = name;
        this.capacity_kg        = capacity_kg;
        this.boom_length_m      = boom_length_m;
        this.base_weight_kg     = base_weight_kg;
        this.outrigger_area_m2  = outrigger_area_m2;
        this.radius_m           = radius_m;
        // Límite operativo (80 % cap nominal)
        this.operative_limit_kg = Math.round(capacity_kg * MAX_UTILIZATION);
    }
}

/**
 * LiftState — snapshot de un instante de la maniobra
 */
export class LiftState {
    constructor(angle_deg, radius_m, load_share) {
        this.angle_deg  = angle_deg;
        this.radius_m   = radius_m;
        this.load_share = load_share;
    }
}

// ─── MOTOR DE SIMULACIÓN ──────────────────────────────────────────────────────

export class LiftSimulation {
    /**
     * @param {Crane} crane
     * @param {Load}  load
     */
    constructor(crane, load) {
        this.crane = crane;
        this.load  = load;
    }

    /**
     * Load Moment = F × radio (Nm)
     * Equivale al indicador LMI / LICCON de Liebherr.
     */
    calculate_load_moment(effective_weight_kg, radius_m) {
        return effective_weight_kg * GRAVITY * radius_m;
    }

    /**
     * Utilización = peso_efectivo / capacidad_nominal
     * OSHA límite: 0.80 (80 %)
     */
    calculate_utilization(effective_weight_kg) {
        return effective_weight_kg / this.crane.capacity_kg;
    }

    /**
     * Ground Bearing Pressure (GBP) en Pascales
     * GBP = (masa_equipo + carga_efectiva) × g / área_outriggers
     */
    ground_bearing_pressure(total_weight_kg) {
        return (total_weight_kg * GRAVITY) / this.crane.outrigger_area_m2;
    }

    /**
     * Clasifica el estado según normas Simlog / OSHA:
     *   OK          — dentro de límites
     *   PERFORMANCE — eficiencia reducida (GBP o velocidad fuera de rango)
     *   PROCEDURE   — utilización > 80 % (límite normativo)
     *   FATAL       — utilización > 95 % — detener maniobra
     */
    classify_status(utilization, gbp_Pa) {
        if (utilization > 0.95)                    return 'FATAL';
        if (utilization > MAX_UTILIZATION)         return 'PROCEDURE';
        if (gbp_Pa > 300_000)                      return 'PERFORMANCE'; // >300 kPa
        return 'OK';
    }

    /**
     * simulate_transition — tabla completa del abatimiento (vertical → horizontal)
     *
     * Modelo Pick & Tilt (equilibrio de momentos):
     *   - Eje de rotación: base del equipo en el piso
     *   - Liebherr controla lug superior (LUG_S)
     *   - Montacargas controla lug inferior (LUG_I)
     *
     * Distribución de carga:
     *   liebherrFrac = sin(θ)×(CG/LUG_S) + cos(θ)×((CG-LUG_I)/(LUG_S-LUG_I))
     *
     * @param {number} [steps=12]  — número de pasos de simulación
     * @param {number} [lug_sup=6.0] — altura lug superior (m)
     * @param {number} [lug_inf=2.0] — altura lug inferior (m)
     * @returns {Array<Object>}   — tabla de resultados por paso
     */
    simulate_transition(steps = 12, lug_sup = 6.0, lug_inf = 2.0) {
        const results = [];
        const LUG_S   = lug_sup;
        const LUG_I   = lug_inf;
        const D_LUGS  = LUG_S - LUG_I;
        const CG      = this.load.cg_height_m;
        const W       = this.load.weight_kg;

        for (let step = 0; step <= steps; step++) {
            // θ va de 0° (vertical) → 90° (horizontal)
            const angle_deg = (90 * step) / steps;
            const theta     = angle_deg * Math.PI / 180;

            // Distribución de carga por equilibrio de momentos (Pick & Tilt)
            const liebherrFrac = Math.sin(theta) * (CG / LUG_S)
                               + Math.cos(theta) * ((CG - LUG_I) / D_LUGS);
            const versaFrac    = Math.max(0, 1 - liebherrFrac);

            const liebherr_kg  = W * liebherrFrac;
            const versa_kg     = W * versaFrac;

            // Radio efectivo del lug superior en el mundo
            // r = cos(θ) × LUG_S  → proyección horizontal
            // Nota: cuando θ=0° (vertical) r=0; cuando θ=90° (horiz.) r=LUG_S
            const radius_m = this.crane.radius_m; // radio fijo del equipo (al eje de izaje)

            // Load Moment Indicator (LMI)
            const lmi_Nm = this.calculate_load_moment(liebherr_kg, radius_m);

            // Utilización Liebherr
            const utilization = this.calculate_utilization(liebherr_kg);

            // Altura del lug superior en el mundo (para clearance)
            const h_lug_sup = 0.5 + LUG_S * Math.cos(theta);

            // Ground Bearing Pressure completa del Liebherr
            const gbp_Pa = this.ground_bearing_pressure(
                this.crane.base_weight_kg + liebherr_kg * DESIGN_FACTOR
            );

            // Tensión en eslingas (2 ramales, 50° apertura)
            const sling_angle_rad = 50 * Math.PI / 180;
            const sling_tension_kg = liebherr_kg / (2 * Math.cos(sling_angle_rad));

            // Estado normativo
            const status = this.classify_status(utilization, gbp_Pa);

            results.push({
                step,
                angle_deg:           +angle_deg.toFixed(1),
                liebherr_kg:         +liebherr_kg.toFixed(0),
                versa_kg:            +versa_kg.toFixed(0),
                'liebherr_%':        +(utilization * 100).toFixed(1),
                'versa_%':           +(versaFrac * 100).toFixed(1),
                lmi_kNm:             +(lmi_Nm / 1000).toFixed(1),
                sling_tension_kg:    +sling_tension_kg.toFixed(0),
                h_lug_sup_m:         +h_lug_sup.toFixed(2),
                gbp_kPa:             +(gbp_Pa / 1000).toFixed(1),
                status,
            });
        }

        return results;
    }

    /**
     * check_normative — validación completa contra normas (devuelve array de alertas)
     * @param {Array} table — resultado de simulate_transition()
     * @returns {Array<{type, step, angle_deg, msg}>}
     */
    check_normative(table) {
        const alerts = [];
        for (const row of table) {
            if (row.status === 'FATAL') {
                alerts.push({ type: 'FATAL', step: row.step, angle_deg: row.angle_deg,
                    msg: `SOBRECARGA: Liebherr ${row['liebherr_%']}% (>95%). DETENER MANIOBRA.` });
            } else if (row.status === 'PROCEDURE') {
                alerts.push({ type: 'PROCEDURE', step: row.step, angle_deg: row.angle_deg,
                    msg: `OSHA violated: Liebherr ${row['liebherr_%']}% supera límite 80%.` });
            } else if (row.status === 'PERFORMANCE') {
                alerts.push({ type: 'PERFORMANCE', step: row.step, angle_deg: row.angle_deg,
                    msg: `GBP elevada: ${row.gbp_kPa} kPa — verificar terreno.` });
            }
        }
        return alerts;
    }
}

// ─── INSTANCIAS PRECONFIGURADAS — MANIOBRA REAL EXPANDER MICSA ───────────────

/** Expander MICSA — datos reales del plan de izaje */
export const expanderLoad = new Load(
    'Expander MICSA',
    17557,    // kg — peso real verificado
    3.80,     // m  — CG al 50% de la longitud
    7.60      // m  — longitud total
);

/** Grúa Liebherr LTM 1050 — configuración real de la maniobra */
export const liebherrCrane = new Crane(
    'Liebherr LTM 1050',
    18144,    // kg — capacidad a radio 4.0 m (tabla oficial)
    6.8,      // m  — longitud efectiva de boom en nave
    36290,    // kg — masa del equipo (80,000 lb)
    2.56,     // m² — 4 outriggers × 0.64m² pad 800×800mm
    4.0       // m  — radio de operación
);

/** Montacargas + Boom Fork (tailing / control de pivote) */
export const versaLiftCrane = new Crane(
    'Montacargas + Boom Fork',
    3629,     // kg — WLL boom fork 8,000 lb
    6.0,      // m  — extensión del boom
    14515,    // kg — masa montacargas (32,000 lb)
    4.0,      // m² — 4 ruedas × 1.0m² contacto
    2.0       // m  — radio al lug inferior
);

/** Simulación preconfigurada — Liebherr como equipo principal */
export const simExpander = new LiftSimulation(liebherrCrane, expanderLoad);

/** Tabla completa de la maniobra (12 pasos, 0°→90°) */
export const liftTable = simExpander.simulate_transition(12);

/** Alertas normativas de la tabla */
export const normativeAlerts = simExpander.check_normative(liftTable);

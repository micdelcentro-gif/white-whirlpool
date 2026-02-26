/**
 * MICSA LIFT ENGINE — ROI Module
 * Módulo financiero: costo por maniobra, ahorro vs método tradicional,
 * retorno de inversión del sistema de simulación.
 *
 * Referencia: guide.html — Simlog KPIs, Virtual Forklift, CRANEbee pricing
 */

'use strict';

// ─── COSTOS BASE (MXN/USD 2024) ──────────────────────────────────────────────
export const COSTS = {
    // Equipos por hora (MXN)
    liebherr_ltm1050_hr:  45_000,   // Liebherr LTM 1050 movilización + renta
    montacargas_hr:        8_500,   // Montacargas + operador
    riggers_hr:            2_800,   // Riggers x2
    senalero_hr:             850,   // Señalero
    ing_responsable_hr:    3_500,   // Ingeniero responsable
    jlg_platform_hr:       1_200,   // Plataforma JLG (rigger acceso)
    // Materiales (MXN, estimado por maniobra)
    eslingas_inspeccion:   1_500,   // Inspección/reemplazo eslingas
    conos_barreras:          400,   // Conos y cinta exclusión
    // Costos de accidente (referencia IMSS/STPS)
    accidente_leve:       85_000,   // Costo promedio accidente leve
    accidente_grave:   1_200_000,   // Costo accidente grave (hospitalización)
    accidente_fatal:  12_000_000,   // Costo accidente fatal (indemnización + legal)
    // Software referencia (USD → MXN aprox ×18)
    cranebee_annual:     108_000,   // CRANEbee licencia anual ~$6,000 USD
    lift_plan_3d_annual:  72_000,   // 3D Lift Plan SaaS ~$4,000 USD/año
    simlog_station:      540_000,   // Simlog station ~$30,000 USD
};

export class ROICalculator {
    /**
     * @param {Object} opts
     * @param {number} opts.maneuver_hours     — duración de la maniobra (h)
     * @param {number} opts.maneuvers_per_year — maniobras similares por año
     * @param {number} opts.simulation_investment — inversión en sistema (MXN)
     */
    constructor(opts = {}) {
        this.maneuver_hours       = opts.maneuver_hours       || 8;
        this.maneuvers_per_year   = opts.maneuvers_per_year   || 12;
        this.sim_investment       = opts.simulation_investment || 250_000;
        // Probabilidad de accidente sin simulación (referencia IMSS)
        this.p_accident_no_sim    = 0.035;  // 3.5% industria pesada
        this.p_accident_with_sim  = 0.004;  // 0.4% con simulación (Simlog report)
    }

    /** Costo directo de la maniobra real */
    maneuver_cost() {
        const C = COSTS;
        const h = this.maneuver_hours;
        return {
            liebherr:        C.liebherr_ltm1050_hr * h,
            montacargas:     C.montacargas_hr * h,
            riggers:         C.riggers_hr * h,
            senalero:        C.senalero_hr * h,
            ing_responsable: C.ing_responsable_hr * h,
            jlg:             C.jlg_platform_hr * h,
            materiales:      C.eslingas_inspeccion + C.conos_barreras,
            get total() {
                return this.liebherr + this.montacargas + this.riggers
                     + this.senalero + this.ing_responsable + this.jlg
                     + this.materiales;
            }
        };
    }

    /** Ahorro en costo de accidentes por año (valor esperado) */
    accident_savings_per_year() {
        const weightedCost = (
            COSTS.accidente_leve  * 0.65 +
            COSTS.accidente_grave * 0.28 +
            COSTS.accidente_fatal * 0.07
        );
        const savingPerManeuver = (this.p_accident_no_sim - this.p_accident_with_sim)
                                * weightedCost;
        return savingPerManeuver * this.maneuvers_per_year;
    }

    /** Ahorro en tiempo de planeación (sin simulación = más tiempo en campo) */
    planning_savings_per_year() {
        // Sin simulación: ~4h extra de planeación en campo por maniobra
        const h_extra = 4;
        const cost_extra = (COSTS.liebherr_ltm1050_hr + COSTS.ing_responsable_hr) * h_extra;
        return cost_extra * this.maneuvers_per_year;
    }

    /** ROI completo */
    roi() {
        const cost      = this.maneuver_cost();
        const accSaving = this.accident_savings_per_year();
        const planSaving = this.planning_savings_per_year();
        const totalSaving = accSaving + planSaving;
        const payback_years = this.sim_investment / totalSaving;
        const roi_pct = ((totalSaving - this.sim_investment) / this.sim_investment) * 100;

        return {
            maneuver_cost_mxn:       Math.round(cost.total),
            annual_maneuver_cost_mxn: Math.round(cost.total * this.maneuvers_per_year),
            accident_savings_yr:     Math.round(accSaving),
            planning_savings_yr:     Math.round(planSaving),
            total_savings_yr:        Math.round(totalSaving),
            sim_investment_mxn:      this.sim_investment,
            payback_months:          Math.round(payback_years * 12),
            roi_pct:                 Math.round(roi_pct),
            cost_breakdown:          cost,
        };
    }

    /** Comparativo vs alternativas del mercado */
    market_comparison() {
        return [
            { product: 'MICSA Lift Engine',  cost_mxn: this.sim_investment,      features: ['Propio', 'BIM', 'WS', 'PDF', 'Normativa'] },
            { product: 'CRANEbee (licencia)', cost_mxn: COSTS.cranebee_annual,    features: ['400 grúas', 'CAD', 'sin BIM custom'] },
            { product: '3D Lift Plan SaaS',   cost_mxn: COSTS.lift_plan_3d_annual, features: ['Nube', 'Google Earth', 'sin personalización'] },
            { product: 'Simlog Station',       cost_mxn: COSTS.simlog_station,     features: ['Hardware', 'KPIs', 'solo capacitación'] },
        ];
    }
}

// Instancia preconfigurada para la maniobra Expander MICSA
export const roiExpander = new ROICalculator({
    maneuver_hours:       10,    // 10h para maniobra Expander
    maneuvers_per_year:    8,    // 8 maniobras similares/año estimado
    simulation_investment: 250_000, // inversión sistema MICSA
});

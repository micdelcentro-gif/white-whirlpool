/**
 * revit_connector.js — Conector BIM/Revit vía REST API
 *
 * Equivalente al script Dynamo/Python de Revit.
 * En Revit + Dynamo: Python Script Node llama a este endpoint.
 *
 * Flujo:
 *   Revit → Dynamo (Python) → POST /api/simulate/custom → Motor físico → Datos BIM
 *
 * CÓDIGO DYNAMO (Python Script Node en Revit):
 * ────────────────────────────────────────────
 * import clr, json, urllib.request
 * clr.AddReference('RevitAPI')
 * from Autodesk.Revit.DB import *
 *
 * # Parámetros del elemento BIM seleccionado
 * elem = UnwrapElement(IN[0])
 * weight_kg = elem.LookupParameter("Weight_kg").AsDouble() * 0.453592
 * cg_m = elem.LookupParameter("CG_Height_m").AsDouble() * 0.3048
 *
 * payload = json.dumps({
 *     "crane": {
 *         "name": "Liebherr LTM 1050",
 *         "capacity_kg": 18144,
 *         "boom_length_m": 6.8,
 *         "base_weight_kg": 36290,
 *         "outrigger_area_m2": 2.56,
 *         "radius_m": 4.0
 *     },
 *     "load": {
 *         "name": elem.Name,
 *         "weight_kg": weight_kg,
 *         "cg_height_m": cg_m,
 *         "height_m": 7.60
 *     },
 *     "steps": 12
 * }).encode()
 *
 * req = urllib.request.Request("http://localhost:8000/api/simulate/custom",
 *     data=payload, headers={"Content-Type":"application/json"}, method="POST")
 * with urllib.request.urlopen(req) as resp:
 *     result = json.loads(resp.read())
 *
 * OUT = result["summary"]["max_utilization"]
 * ────────────────────────────────────────────
 *
 * Este conector JS puede invocarse desde cualquier sistema externo via REST.
 */

'use strict';

const http = require('http');

/**
 * queryLiftEngine — consulta el motor de física con parámetros BIM
 * @param {Object} craneData — datos de la grúa
 * @param {Object} loadData  — datos de la carga (del modelo BIM)
 * @returns {Promise<Object>} — resultado del motor
 */
function queryLiftEngine(craneData, loadData, steps = 12) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ crane: craneData, load: loadData, steps });
        const options = {
            hostname: 'localhost',
            port: 8000,
            path: '/api/simulate/custom',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// EJEMPLO DE USO (simula un elemento BIM con peso y CG variables):
async function runBimExample() {
    const crane = {
        name: 'Liebherr LTM 1050',
        capacity_kg: 18144,
        boom_length_m: 6.8,
        base_weight_kg: 36290,
        outrigger_area_m2: 2.56,
        radius_m: 4.0,
        lug_sup: 6.0,
        lug_inf: 2.0,
    };

    const load = {
        name: 'Elemento BIM — Expander MICSA',
        weight_kg: 17557,   // <-- viene del parámetro Revit convertido a kg
        cg_height_m: 3.80,  // <-- viene del modelo BIM
        height_m: 7.60,
    };

    try {
        const result = await queryLiftEngine(crane, load, 12);
        console.log('\n📐 RESULTADO BIM → MICSA LIFT ENGINE');
        console.log('─'.repeat(44));
        console.log('Utilización máx. Liebherr:', result.summary.max_utilization + '%');
        console.log('GBP máx.:                 ', result.summary.max_gbp_kPa + ' kPa');
        console.log('LMI máx.:                 ', result.summary.max_lmi_kNm + ' kNm');
        console.log('Eventos normativos:       ', result.alerts.length);
        console.log('Cumplimiento:             ', result.summary.norm_ok ? '✅ OK' : '❌ REVISAR');
        console.log('─'.repeat(44));
        console.log('\n→ Retornar a Revit: utilización = ' + result.summary.max_utilization + '%');
    } catch (err) {
        console.error('Error conectando al motor:', err.message);
        console.log('⚠️  Verifica que el servidor esté corriendo: node engine/api.js');
    }
}

if (require.main === module) runBimExample();

module.exports = { queryLiftEngine };

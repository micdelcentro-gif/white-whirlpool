/**
 * MICSA LIFT ENGINE — Report Generator
 * Equivalente a report_generator.py con ReportLab.
 *
 * Genera HTML/JSON que el frontend convierte a PDF vía window.print() o jsPDF.
 * El endpoint GET /report devuelve el HTML listo para imprimir.
 */

'use strict';

function generateHtmlReport(summary, table, alerts) {
    const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

    const alertRows = alerts.length > 0
        ? alerts.map(a => `
            <tr class="${a.type.toLowerCase()}">
                <td>${a.type}</td>
                <td>${a.angle_deg}°</td>
                <td>${a.msg}</td>
            </tr>`).join('')
        : `<tr><td colspan="3" class="ok">✅ Sin eventos normativos</td></tr>`;

    const tableRows = table.filter((_, i) => i % 10 === 0).map(r => `
        <tr class="${r.status !== 'OK' ? r.status.toLowerCase() : ''}">
            <td>${r.step}</td>
            <td>${r.angle_deg}°</td>
            <td>${r.liebherr_kg.toLocaleString()} kg</td>
            <td>${r.versa_kg.toLocaleString()} kg</td>
            <td>${r['liebherr_%']}%</td>
            <td>${r.lmi_kNm} kNm</td>
            <td>${r.gbp_kPa} kPa</td>
            <td>${r.clearance_m} m</td>
            <td class="${r.status === 'OK' ? 'ok' : r.status === 'FATAL' ? 'fatal' : 'warn'}">${r.status}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Plan de Izaje — MICSA Lift Engine</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', sans-serif; color: #0a1628; background: #fff; padding: 32px; }
  .header { border-bottom: 3px solid #f5c518; padding-bottom: 16px; margin-bottom: 24px; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size: 22px; font-weight: 900; color: #1a3a5c; }
  .logo span { color: #f5c518; }
  .meta { font-size: 11px; color: #666; text-align:right; }
  h2 { font-size: 13px; font-weight:700; color: #1a3a5c; text-transform:uppercase; letter-spacing:1px; margin:20px 0 10px; border-left:3px solid #f5c518; padding-left:8px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom:20px; }
  .card { background:#f4f8ff; border:1px solid #dde8ff; border-radius:8px; padding:12px; }
  .card-label { font-size:10px; color:#666; text-transform:uppercase; }
  .card-value { font-size:18px; font-weight:900; color:#1a3a5c; margin-top:4px; }
  .card-value.danger { color:#c00; }
  .card-value.warn   { color:#cc6600; }
  .card-value.ok     { color:#007744; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#1a3a5c; color:#fff; padding:7px 8px; text-align:left; font-weight:600; }
  td { padding:6px 8px; border-bottom:1px solid #eee; }
  tr.fatal td { background:#fff0f0; color:#c00; }
  tr.procedure td { background:#fff8e0; color:#884400; }
  tr.performance td { background:#f0f8f0; }
  td.ok { color:#007744; font-weight:700; }
  td.fatal { color:#c00; font-weight:900; }
  td.warn { color:#884400; font-weight:700; }
  .norm { margin-top:20px; font-size:10px; color:#888; border-top:1px solid #eee; padding-top:12px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">MICSA <span>Lift Engine</span></div>
    <div style="font-size:11px;color:#888;margin-top:4px">Sistema Profesional de Planificación de Izajes</div>
  </div>
  <div class="meta">
    <div><strong>Generado:</strong> ${now}</div>
    <div><strong>Grúa:</strong> ${summary.crane}</div>
    <div><strong>Carga:</strong> ${summary.load}</div>
  </div>
</div>

<h2>📊 Resumen Ejecutivo</h2>
<div class="summary-grid">
  <div class="card">
    <div class="card-label">Peso Real</div>
    <div class="card-value">${summary.weight_kg.toLocaleString()} kg</div>
  </div>
  <div class="card">
    <div class="card-label">Peso de Diseño (FD=1.10)</div>
    <div class="card-value">${summary.design_weight_kg.toLocaleString()} kg</div>
  </div>
  <div class="card">
    <div class="card-label">Utilización Máx. Liebherr</div>
    <div class="card-value ${summary.max_utilization > 80 ? 'danger' : summary.max_utilization > 60 ? 'warn' : 'ok'}">${summary.max_utilization}%</div>
  </div>
  <div class="card">
    <div class="card-label">GBP Máx. Outriggers</div>
    <div class="card-value ${summary.max_gbp_kPa > 300 ? 'danger' : 'ok'}">${summary.max_gbp_kPa} kPa</div>
  </div>
  <div class="card">
    <div class="card-label">LMI Máx.</div>
    <div class="card-value">${summary.max_lmi_kNm} kNm</div>
  </div>
  <div class="card">
    <div class="card-label">Clearance Mínimo</div>
    <div class="card-value ${summary.min_clearance_m < 0.30 ? 'danger' : 'ok'}">${summary.min_clearance_m} m</div>
  </div>
  <div class="card">
    <div class="card-label">Eventos FATAL</div>
    <div class="card-value ${summary.fatal_events > 0 ? 'danger' : 'ok'}">${summary.fatal_events}</div>
  </div>
  <div class="card">
    <div class="card-label">Cumplimiento Normativo</div>
    <div class="card-value ${summary.norm_ok ? 'ok' : 'danger'}">${summary.norm_ok ? '✅ OK' : '❌ REVISAR'}</div>
  </div>
</div>

<h2>⚠️ Eventos Normativos</h2>
<table>
  <tr><th>Tipo</th><th>Ángulo</th><th>Descripción</th></tr>
  ${alertRows}
</table>

<h2>📋 Tabla de Simulación (cada 10 pasos)</h2>
<table>
  <tr>
    <th>#</th><th>Ángulo</th><th>Liebherr</th><th>Versa</th>
    <th>Util%</th><th>LMI kNm</th><th>GBP kPa</th><th>Clearance</th><th>Estado</th>
  </tr>
  ${tableRows}
</table>

<div class="norm">
  <strong>Normas aplicadas:</strong> ${summary.norm}<br>
  <strong>Límite operativo:</strong> 80% capacidad nominal (OSHA / Walmart México) |
  <strong>Factor de diseño:</strong> FD = 1.10 | MICSA Lift Engine v2.0
</div>
</body>
</html>`;
}

module.exports = { generateHtmlReport };

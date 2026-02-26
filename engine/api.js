/**
 * MICSA LIFT ENGINE — API REST + WebSocket Server
 * Equivalente a api.py con FastAPI + Uvicorn.
 *
 * Endpoints:
 *   GET  /api/health              — estado del servidor
 *   GET  /api/simulate            — tabla completa (12 pasos)
 *   GET  /api/simulate?steps=120  — tabla de alta resolución
 *   GET  /api/summary             — resumen ejecutivo
 *   GET  /api/alerts              — eventos normativos
 *   POST /api/simulate/custom     — simulación con parámetros custom
 *   GET  /report                  — reporte HTML listo para imprimir/PDF
 *   WS   /ws                      — stream en tiempo real del ángulo de simulación
 *
 * Puerto: 8000
 */

'use strict';

const express    = require('express');
const http       = require('http');
const { WebSocketServer } = require('ws');
const cors       = require('cors');
const path       = require('path');

const { LiftPhysicsEngine, Load, Crane, engineExpander, EXPANDER, LIEBHERR, VERSA } = require('./physics_engine');
const { generateHtmlReport } = require('./report_generator');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// ─── PRE-COMPUTE tabla estándar ───────────────────────────────────────────────
const stdTable  = engineExpander.simulate_tilt(120);
const stdAlerts = engineExpander.validate(stdTable);
const stdSummary = engineExpander.summary(stdTable);

console.log('┌─────────────────────────────────────────┐');
console.log('│  MICSA LIFT ENGINE — API REST + WS      │');
console.log('│  Puerto: 8000                           │');
console.log('├─────────────────────────────────────────┤');
console.log(`│  Carga:  ${EXPANDER.name.padEnd(31)}│`);
console.log(`│  Motor:  ${LIEBHERR.name.padEnd(31)}│`);
console.log(`│  Pasos:  120 (0°→90°)                   │`);
console.log(`│  Alerts: ${String(stdAlerts.length).padEnd(31)}│`);
console.log('└─────────────────────────────────────────┘');

// ─── REST ENDPOINTS ───────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', engine: 'MICSA Lift Engine v2.0', timestamp: new Date().toISOString() });
});

app.get('/api/simulate', (req, res) => {
    const steps = parseInt(req.query.steps) || 12;
    const table = engineExpander.simulate_tilt(Math.min(steps, 360));
    res.json({ ok: true, steps: table.length, table });
});

app.get('/api/summary', (req, res) => {
    res.json({ ok: true, summary: stdSummary });
});

app.get('/api/alerts', (req, res) => {
    res.json({ ok: true, count: stdAlerts.length, alerts: stdAlerts });
});

app.post('/api/simulate/custom', (req, res) => {
    try {
        const { crane: craneData, load: loadData, steps = 12 } = req.body;
        if (!craneData || !loadData) {
            return res.status(400).json({ ok: false, error: 'crane y load son requeridos' });
        }
        const crane  = new Crane(craneData);
        const load   = new Load(loadData);
        const engine = new LiftPhysicsEngine(crane, load);
        const table  = engine.simulate_tilt(Math.min(steps, 360));
        const alerts = engine.validate(table);
        const summary = engine.summary(table);
        res.json({ ok: true, summary, alerts, table });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Reporte HTML listo para imprimir / convertir a PDF
app.get('/report', (req, res) => {
    const html = generateHtmlReport(stdSummary, stdTable, stdAlerts);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

// ─── WEBSOCKET — stream en tiempo real ───────────────────────────────────────
// El frontend (Three.js) se conecta aquí para recibir el estado físico
// frame a frame durante la animación.

wss.on('connection', (ws) => {
    console.log('[WS] Cliente conectado');

    // Enviar tabla precomputada al conectar
    ws.send(JSON.stringify({ type: 'INIT', summary: stdSummary, alerts: stdAlerts }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);

            // El frontend envía: { type: 'QUERY_ANGLE', angle_deg: 45.3 }
            // El servidor responde con la fila interpolada de la tabla
            if (msg.type === 'QUERY_ANGLE') {
                const angle = parseFloat(msg.angle_deg) || 0;
                const row   = stdTable.reduce((best, r) =>
                    Math.abs(r.angle_deg - angle) < Math.abs(best.angle_deg - angle) ? r : best
                , stdTable[0]);
                ws.send(JSON.stringify({ type: 'PHYSICS_STATE', row }));
            }

            // El frontend envía: { type: 'SIMULATE', crane: {...}, load: {...} }
            if (msg.type === 'SIMULATE') {
                const crane  = new Crane(msg.crane  || LIEBHERR);
                const load   = new Load(msg.load    || EXPANDER);
                const engine = new LiftPhysicsEngine(crane, load);
                const table  = engine.simulate_tilt(120);
                const alerts = engine.validate(table);
                const sum    = engine.summary(table);
                ws.send(JSON.stringify({ type: 'SIM_RESULT', summary: sum, alerts, table }));
            }
        } catch (e) {
            ws.send(JSON.stringify({ type: 'ERROR', msg: e.message }));
        }
    });

    ws.on('close', () => console.log('[WS] Cliente desconectado'));
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`\n🚀 MICSA Lift Engine API corriendo en http://localhost:${PORT}`);
    console.log(`📊 Dashboard:  http://localhost:${PORT}/report`);
    console.log(`🔌 WebSocket:  ws://localhost:${PORT}/ws`);
    console.log(`📡 REST API:   http://localhost:${PORT}/api/simulate\n`);
});

module.exports = { app, server };
